import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPublicClient, createWalletClient, erc20Abi, formatEther, formatUnits, getAddress, http, isAddress } from 'viem';
import type { Chain } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { baseSepolia, bscTestnet, polygonAmoy } from 'viem/chains';
import { NETWORKS } from '../chain/networks.ts';

// Operator tool, run on the operator's own computer (never on the server): moves the stablecoin from the personal
// deposit addresses (seed path m/44'/60'/0'/0/i, the addresses the API derives from DEPOSIT_XPUB) to one
// destination, for example the issuer's balance deposit address. Test networks only. Without --send it only lists.
// A deposit address has no gas of its own: with --send the tool first tops it up from the gas wallet, the first
// address of the seed's second account (m/44'/60'/1'/0/0), which never receives deposits. Fund that one address.
// Usage: node src/dev/sweep-deposits.ts <destination> [--chain 84532|80002|97] [--count 50] [--send]
//   SEED_FILE (default .local/deposit-testnet-seed.txt), RPC_URL (default: the network's public endpoint)

const CHAINS: Record<number, Chain> = { 84532: baseSepolia, 80002: polygonAmoy, 97: bscTestnet };
const args = process.argv.slice(2);
const option = (name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const destination = args.find((arg, at) => !arg.startsWith('--') && !args[at - 1]?.startsWith('--'));
const chainId = Number(option('--chain') ?? 84532);
const count = Number(option('--count') ?? 50) || 50;
const send = args.includes('--send');
const chain = CHAINS[chainId];
const token = NETWORKS[chainId]?.tokens[0];
if (!destination || !isAddress(destination) || !chain || !token) {
  console.error('Usage: node src/dev/sweep-deposits.ts <destination address> [--chain 84532|80002|97] [--count 50] [--send]');
  process.exit(1);
}
const seedFile = process.env.SEED_FILE ?? resolve(import.meta.dirname, '../../.local/deposit-testnet-seed.txt');
const mnemonic = readFileSync(seedFile, 'utf8').split(/\r?\n/).find(line => line.trim() && !line.startsWith('#'))?.trim();
if (!mnemonic) { console.error(`No seed phrase in ${seedFile}.`); process.exit(1); }
const transport = http(process.env.RPC_URL ?? chain.rpcUrls.default.http[0]);
const client = createPublicClient({ chain, transport });
if (await client.getChainId() !== chainId) { console.error(`The RPC is not ${chain.name}; this tool is testnet only.`); process.exit(1); }
const gasAccount = mnemonicToAccount(mnemonic, { accountIndex: 1 });
const gasWallet = createWalletClient({ account: gasAccount, chain, transport });
const coin = chain.nativeCurrency.symbol;
console.log(`${chain.name}, ${token.symbol}. Gas wallet ${gasAccount.address}: ${formatEther(await client.getBalance({ address: gasAccount.address }))} ${coin}.`);

let total = 0n;
for (let index = 0; index < count; index++) {
  const account = mnemonicToAccount(mnemonic, { addressIndex: index });
  const [units, gas] = await Promise.all([
    client.readContract({ address: getAddress(token.address), abi: erc20Abi, functionName: 'balanceOf', args: [account.address] }),
    client.getBalance({ address: account.address }),
  ]);
  if (units === 0n) continue;
  total += units;
  const line = `#${index} ${account.address}: ${formatUnits(units, token.decimals)} ${token.symbol}, ${formatEther(gas)} ${coin} for fees`;
  if (!send) { console.log(line); continue; }
  try {
    const transfer = { address: getAddress(token.address), abi: erc20Abi, functionName: 'transfer', args: [getAddress(destination), units] } as const;
    // A fifth on top of the estimate covers a price move between the two transactions.
    const fee = (await client.estimateContractGas({ ...transfer, account: account.address })) * (await client.getGasPrice()) * 6n / 5n;
    if (gas < fee) {
      const funding = await gasWallet.sendTransaction({ to: account.address, value: fee - gas });
      await client.waitForTransactionReceipt({ hash: funding });
    }
    const wallet = createWalletClient({ account, chain, transport });
    const hash = await wallet.writeContract(transfer);
    const receipt = await client.waitForTransactionReceipt({ hash });
    console.log(`${line} -> sent ${receipt.status} ${hash}`);
  } catch (error) {
    // Usually the gas wallet is empty: send it a little test coin and run again.
    console.log(`${line} -> not sent: ${(error as Error).message.split('\n')[0]}`);
  }
}
console.log(`${send ? 'Swept' : 'Found'} ${formatUnits(total, token.decimals)} ${token.symbol} on the first ${count} deposit addresses${send ? '' : ' (dry run; add --send to move it)'}.`);
