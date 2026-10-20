import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig, readFundingConfig, readTrustedProxy, readWalletAuthConfig } from '../src/config.ts';

const configured: NodeJS.ProcessEnv = {
  WALLET_AUTH_ENABLED: 'true', SIWE_ORIGIN: 'https://demo.example', SIWE_URI: 'https://demo.example/sign-in',
  AUTH_CHAIN_IDS: '84532', BASE_SEPOLIA_RPC_URL: 'https://rpc.example/test-only-key',
};

test('wallet runtime is explicit, testnet-only and never inferred from fixture or unselected RPCs', () => {
  assert.equal(readWalletAuthConfig({}, 'testnet'), undefined);
  assert.equal(readWalletAuthConfig({ ...configured, WALLET_AUTH_ENABLED: 'false' }, 'testnet'), undefined);
  assert.throws(() => readWalletAuthConfig(configured, 'fixture'));
  const actual = readConfig({ ...configured, DATABASE_URL: 'postgresql://local/db' });
  assert.deepEqual(actual.walletAuth, {
    configuration: { origin: 'https://demo.example', uri: 'https://demo.example/sign-in', allowedChainIds: [84532] },
    endpoints: [{ chainId: 84532, url: 'https://rpc.example/test-only-key' }],
  });
  const both = readWalletAuthConfig({ ...configured, AUTH_CHAIN_IDS: '84532,11155111', ETHEREUM_SEPOLIA_RPC_URL: 'https://ethereum.example/' }, 'testnet');
  assert.deepEqual(both?.configuration.allowedChainIds, [84532, 11155111]);
});

test('wallet runtime rejects incomplete, ambiguous, mainnet and unsafe URL configuration without echoing secrets', () => {
  for (const overrides of [
    { WALLET_AUTH_ENABLED: 'yes' }, { SIWE_ORIGIN: undefined }, { SIWE_ORIGIN: 'http://demo.example' },
    { SIWE_ORIGIN: 'https://demo.example/' }, { SIWE_URI: 'https://other.example/sign-in' },
    { SIWE_URI: 'https://user:private-value@demo.example/sign-in' }, { SIWE_URI: 'https://demo.example/sign-in#fragment' },
    { AUTH_CHAIN_IDS: '' }, { AUTH_CHAIN_IDS: '1' }, { AUTH_CHAIN_IDS: '8453' },
    { AUTH_CHAIN_IDS: '84532,84532' }, { AUTH_CHAIN_IDS: '84532,' }, { AUTH_CHAIN_IDS: ' 84532' },
    { AUTH_CHAIN_IDS: '11155111' }, { BASE_SEPOLIA_RPC_URL: undefined },
    { BASE_SEPOLIA_RPC_URL: 'http://rpc.example/private-value' },
    { BASE_SEPOLIA_RPC_URL: 'https://user:private-value@rpc.example/' },
    { BASE_SEPOLIA_RPC_URL: 'https://rpc.example/#private-value' },
    { BASE_SEPOLIA_RPC_URL: ' https://rpc.example/private-value' },
    { BASE_SEPOLIA_RPC_URL: 'https://rpc.example/pri\nvate-value' },
    { BASE_SEPOLIA_RPC_URL: 'https://rpc.example\\private-value' },
  ]) {
    assert.throws(() => readWalletAuthConfig({ ...configured, ...overrides }, 'testnet'), error => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes('private-value'));
      return true;
    });
  }
});

test('trusted proxy is one explicit address or CIDR block, never every hop', () => {
  assert.equal(readTrustedProxy({}), undefined);
  assert.equal(readTrustedProxy({ TRUSTED_PROXY: '172.30.10.1' }), '172.30.10.1');
  assert.equal(readTrustedProxy({ TRUSTED_PROXY: '172.30.10.0/24' }), '172.30.10.0/24');
  assert.equal(readTrustedProxy({ TRUSTED_PROXY: '::1' }), '::1');
  for (const value of ['true', '*', '172.30.10.1,10.0.0.1', '172.30.10.0/33', '172.30.10.0/', 'proxy.example', '0.0.0.0/0', '::/0', '0.0.0.0/0/1']) {
    assert.throws(() => readTrustedProxy({ TRUSTED_PROXY: value }), /TRUSTED_PROXY/, value);
  }
});

test('Robinhood Chain Testnet is selectable for sign-in and top-ups; its mainnet is not', () => {
  const robinhood = { ...configured, AUTH_CHAIN_IDS: '46630', ROBINHOOD_TESTNET_RPC_URL: 'https://robinhood.example/' };
  const auth = readWalletAuthConfig(robinhood, 'testnet');
  assert.deepEqual(auth?.endpoints, [{ chainId: 46630, url: 'https://robinhood.example/' }]);
  assert.throws(() => readWalletAuthConfig({ ...robinhood, AUTH_CHAIN_IDS: '4663' }, 'testnet'), /testnet IDs/);
  const funding = { TOP_UP_ENABLED: 'true', TOP_UP_CHAIN_ID: '46630', TOP_UP_RECIPIENT_ADDRESS: `0x${'1'.repeat(40)}`, TOP_UP_TOKEN_ADDRESS: `0x${'2'.repeat(40)}` };
  assert.deepEqual(readFundingConfig(funding, auth)?.networks, [{
    chainId: 46630, name: 'Robinhood Chain Testnet', confirmations: 5, explorerTxURL: 'https://explorer.testnet.chain.robinhood.com/tx/',
    nativeSymbol: 'ETH', mainnet: false, assets: [{ symbol: 'USDC', name: 'USDC (Robinhood Chain Testnet test token)', tokenAddress: `0x${'2'.repeat(40)}`, decimals: 6 }],
  }]);
  // The Base Sepolia token variable never leaks into another network, and mainnet is refused.
  assert.throws(() => readFundingConfig({ ...funding, TOP_UP_TOKEN_ADDRESS: undefined, BASE_SEPOLIA_USDC_ADDRESS: `0x${'2'.repeat(40)}` }, auth), /TOKEN_ADDRESS/);
  assert.throws(() => readFundingConfig({ ...funding, TOP_UP_CHAIN_ID: '4663' }, auth), /TOP_UP_CHAIN_ID/);
  assert.throws(() => readFundingConfig({ ...funding, TOP_UP_CHAIN_ID: '84532' }, auth), /AUTH_CHAIN_IDS including 84532/);
});

test('real networks need NETWORK_MODE=mainnet with MAINNET_ENABLED and accept only the listed stablecoins', () => {
  const real = { ...configured, AUTH_CHAIN_IDS: '137,56', POLYGON_RPC_URL: 'https://polygon.example/', BSC_RPC_URL: 'https://bsc.example/' };
  // A test server can never reach a real network, and a real one never a test network.
  assert.throws(() => readWalletAuthConfig(real, 'testnet'), /testnet IDs/);
  assert.throws(() => readWalletAuthConfig({ ...real, AUTH_CHAIN_IDS: '84532' }, 'mainnet'), /real-network IDs/);
  const auth = readWalletAuthConfig(real, 'mainnet');
  assert.deepEqual(auth?.endpoints.map(e => e.chainId), [137, 56]);
  const funding = { TOP_UP_ENABLED: 'true', TOP_UP_RECIPIENT_ADDRESS: `0x${'1'.repeat(40)}`, TOP_UP_ASSETS: '137:USDT,56:USDT,56:USDC' };
  const networks = readFundingConfig(funding, auth, 'mainnet')!.networks;
  assert.deepEqual(networks.map(n => [n.chainId, n.nativeSymbol, n.confirmations, n.assets.map(a => `${a.symbol}:${a.decimals}:${a.tokenAddress}`)]), [
    [137, 'POL', 32, ['USDT:6:0xc2132D05D31c914a87C6611C10748AEb04B58e8F']],
    [56, 'BNB', 15, ['USDT:18:0x55d398326f99059fF775485246999027B3197955', 'USDC:18:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d']],
  ]);
  // Token contracts come only from the fixed list; a configured address is ignored, unknown picks fail.
  assert.throws(() => readFundingConfig({ ...funding, TOP_UP_ASSETS: '137:DAI' }, auth, 'mainnet'), /not a supported real-network stablecoin/);
  assert.throws(() => readFundingConfig({ ...funding, TOP_UP_ASSETS: '84532:USDC' }, auth, 'mainnet'), /not a supported real-network stablecoin/);
  assert.throws(() => readFundingConfig({ ...funding, TOP_UP_ASSETS: '' }, auth, 'mainnet'), /TOP_UP_ASSETS/);
  assert.throws(() => readFundingConfig({ ...funding, TOP_UP_ASSETS: '137:USDT,137:USDT' }, auth, 'mainnet'), /twice/);
  assert.throws(() => readFundingConfig({ ...funding, TOP_UP_RECIPIENT_ADDRESS: undefined }, auth, 'mainnet'), /RECIPIENT/);
  assert.equal(readFundingConfig({ ...funding, TOP_UP_CONFIRMATIONS: '64' }, auth, 'mainnet')!.networks[0]!.confirmations, 64);
  // The whole mode needs a second, explicit switch.
  const env = { ...real, ...funding, NETWORK_MODE: 'mainnet', DATABASE_URL: 'postgres://x', WALLET_AUTH_ENABLED: 'true' };
  assert.throws(() => readConfig(env), /MAINNET_ENABLED=true/);
  // Real stablecoins are never accepted for a demo card or a sandbox IZIPAY card.
  assert.throws(() => readConfig({ ...env, MAINNET_ENABLED: 'true' }), /live IZIPAY key/);
  const izipay = { ISSUER_MODE: 'izipay', IZIPAY_CARDHOLDER_EMAIL_DOMAIN: 'cards.example' };
  assert.throws(() => readConfig({ ...env, ...izipay, MAINNET_ENABLED: 'true', IZIPAY_API_KEY: 'izpk_test_example' }), /live IZIPAY key/);
  const live = { ...env, ...izipay, MAINNET_ENABLED: 'true', IZIPAY_API_KEY: 'izpk_live_example', IZIPAY_ALLOW_LIVE: 'true' };
  assert.equal(readConfig(live).networkMode, 'mainnet');
  // The operator markup applies on real networks exactly as on test networks, and is validated the same way.
  assert.equal(readConfig({ ...live, TOP_UP_SERVICE_FEE_BPS: '250' }).funding?.serviceFeeBps, 250);
  assert.equal(readConfig(live).funding?.serviceFeeBps, 0);
  assert.throws(() => readConfig({ ...live, TOP_UP_SERVICE_FEE_BPS: 'abc' }), /TOP_UP_SERVICE_FEE_BPS/);
});
