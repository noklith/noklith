/**
 * The only networks this service may talk to. Test networks run with NETWORK_MODE=testnet; the real
 * networks only with NETWORK_MODE=mainnet and MAINNET_ENABLED=true, so a test server can never reach them.
 * Token contracts are fixed here, not taken from configuration, so a typo cannot redirect a refill.
 */
export interface NetworkToken { symbol: string; name: string; address: string; decimals: number }
export interface NetworkDefinition {
  name: string;
  rpcVariable: string;
  explorerTxURL: string;
  mainnet: boolean;
  /** Gas currency the user's wallet pays the network fee in. */
  nativeSymbol: string;
  /** Default confirmations before a transfer counts; TOP_UP_CONFIRMATIONS overrides it. */
  confirmations: number;
  /** Stablecoins accepted for card refills (1 token = 1 USD), picked with TOP_UP_ASSETS. */
  tokens: readonly NetworkToken[];
}

export const NETWORKS: Readonly<Record<number, NetworkDefinition>> = {
  // Base Sepolia: Circle's test USDC (symbol USDC, 6 decimals), read from the chain on 2026-10-31.
  84532: { name: 'Base Sepolia', rpcVariable: 'BASE_SEPOLIA_RPC_URL', explorerTxURL: 'https://sepolia.basescan.org/tx/',
    mainnet: false, nativeSymbol: 'ETH', confirmations: 5, tokens: [
      { symbol: 'USDC', name: 'USD Coin (Base Sepolia test token)', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6 },
    ] },
  11155111: { name: 'Ethereum Sepolia', rpcVariable: 'ETHEREUM_SEPOLIA_RPC_URL', explorerTxURL: 'https://sepolia.etherscan.io/tx/',
    mainnet: false, nativeSymbol: 'ETH', confirmations: 5, tokens: [] },
  // Robinhood Chain Testnet (Arbitrum Orbit, gas in test ETH). Its mainnet is 4663 and is not supported.
  46630: { name: 'Robinhood Chain Testnet', rpcVariable: 'ROBINHOOD_TESTNET_RPC_URL', explorerTxURL: 'https://explorer.testnet.chain.robinhood.com/tx/',
    mainnet: false, nativeSymbol: 'ETH', confirmations: 5, tokens: [] },
  // Test stands for Polygon and BNB Smart Chain, read from the chains on 2026-10-31. Neither has an official test
  // USDT on Amoy, so Amoy uses Circle's test USDC; the BNB Chain faucet's test USDT has 18 decimals like the real one.
  80002: { name: 'Polygon Amoy', rpcVariable: 'POLYGON_AMOY_RPC_URL', explorerTxURL: 'https://amoy.polygonscan.com/tx/',
    mainnet: false, nativeSymbol: 'POL', confirmations: 5, tokens: [
      { symbol: 'USDC', name: 'USD Coin (Polygon Amoy test token)', address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', decimals: 6 },
    ] },
  97: { name: 'BNB Smart Chain Testnet', rpcVariable: 'BSC_TESTNET_RPC_URL', explorerTxURL: 'https://testnet.bscscan.com/tx/',
    mainnet: false, nativeSymbol: 'BNB', confirmations: 5, tokens: [
      { symbol: 'USDT', name: 'Tether USD (BNB Smart Chain Testnet test token)', address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', decimals: 18 },
    ] },
  // Real networks for card refills. Verify each contract on the explorer before enabling a network.
  // Base: native USDC by Circle, read from the chain on 2026-10-21 (symbol USDC, 6 decimals, chain 0x2105).
  // About 2 s blocks; 20 confirmations is roughly 40 s.
  8453: { name: 'Base', rpcVariable: 'BASE_RPC_URL', explorerTxURL: 'https://basescan.org/tx/',
    mainnet: true, nativeSymbol: 'ETH', confirmations: 20, tokens: [
      { symbol: 'USDC', name: 'USD Coin (Base)', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    ] },
  137: { name: 'Polygon', rpcVariable: 'POLYGON_RPC_URL', explorerTxURL: 'https://polygonscan.com/tx/',
    mainnet: true, nativeSymbol: 'POL', confirmations: 32, tokens: [
      { symbol: 'USDT', name: 'Tether USD (Polygon)', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
      { symbol: 'USDC', name: 'USD Coin (Polygon)', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
    ] },
  56: { name: 'BNB Smart Chain', rpcVariable: 'BSC_RPC_URL', explorerTxURL: 'https://bscscan.com/tx/',
    mainnet: true, nativeSymbol: 'BNB', confirmations: 15, tokens: [
      { symbol: 'USDT', name: 'Tether USD (BNB Smart Chain)', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
      { symbol: 'USDC', name: 'USD Coin (BNB Smart Chain)', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
    ] },
};

const ids = (mainnet: boolean) => new Set(Object.entries(NETWORKS).filter(([, n]) => n.mainnet === mainnet).map(([id]) => Number(id)));
export const TESTNET_IDS: ReadonlySet<number> = ids(false);
export const MAINNET_IDS: ReadonlySet<number> = ids(true);
export const KNOWN_CHAIN_IDS: ReadonlySet<number> = new Set(Object.keys(NETWORKS).map(Number));
/** Test networks only, under the name the configuration used before real networks existed. */
export const TESTNETS: Readonly<Record<number, NetworkDefinition>> =
  Object.fromEntries(Object.entries(NETWORKS).filter(([, n]) => !n.mainnet));
