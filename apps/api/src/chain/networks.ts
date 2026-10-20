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
  /** Stablecoins accepted for card refills on a real network (1 token = 1 USD). Test networks name theirs in configuration. */
  tokens: readonly NetworkToken[];
}

export const NETWORKS: Readonly<Record<number, NetworkDefinition>> = {
  84532: { name: 'Base Sepolia', rpcVariable: 'BASE_SEPOLIA_RPC_URL', explorerTxURL: 'https://sepolia.basescan.org/tx/',
    mainnet: false, nativeSymbol: 'ETH', confirmations: 5, tokens: [] },
  11155111: { name: 'Ethereum Sepolia', rpcVariable: 'ETHEREUM_SEPOLIA_RPC_URL', explorerTxURL: 'https://sepolia.etherscan.io/tx/',
    mainnet: false, nativeSymbol: 'ETH', confirmations: 5, tokens: [] },
  // Robinhood Chain Testnet (Arbitrum Orbit, gas in test ETH). Its mainnet is 4663 and is not supported.
  46630: { name: 'Robinhood Chain Testnet', rpcVariable: 'ROBINHOOD_TESTNET_RPC_URL', explorerTxURL: 'https://explorer.testnet.chain.robinhood.com/tx/',
    mainnet: false, nativeSymbol: 'ETH', confirmations: 5, tokens: [] },
  // Real networks for card refills. Verify each contract on the explorer before enabling a network.
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
