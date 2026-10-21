import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPublicClient, createWalletClient, erc20Abi, formatEther, formatUnits, getAddress, http, isAddress } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

// Operator tool, run on the operator's own computer (never on the server): moves USDC from the personal
// deposit addresses (seed path m/44'/60'/0'/0/i, the addresses the API derives from DEPOSIT_XPUB) to one
// destination wallet. Testnet only. Without --send it only lists balances.
// Usage: node src/dev/sweep-deposits.ts <destination> [--count 50] [--send]
//   SEED_FILE (default .local/deposit-testnet-seed.txt), RPC_URL (default https://sepolia.base.org)

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // USDC on Base Sepolia (Circle test token)
const args = process.argv.slice(2);
const destination = args.find(arg => !arg.startsWith('--'));
const count = Number(args[args.indexOf('--count') + 1] ?? 50) || 50;
const send = args.includes('--send');
if (!destination || !isAddress(destination)) {
  console.error('Usage: node src/dev/sweep-deposits.ts <destination address> [--count 50] [--send]');
  process.exit(1);
}
const seedFile = process.env.SEED_FILE ?? resolve(import.meta.dirname, '../../.local/deposit-testnet-seed.txt');
const mnemonic = readFileSync(seedFile, 'utf8').split(/\r?\n/).find(line => line.trim() && !line.startsWith('#'))?.trim();
if (!mnemonic) { console.error(`No seed phrase in ${seedFile}.`); process.exit(1); }
const transport = http(process.env.RPC_URL ?? 'https://sepolia.base.org');
const client = createPublicClient({ chain: baseSepolia, transport });
if (await client.getChainId() !== baseSepolia.id) { console.error('The RPC is not Base Sepolia; this tool is testnet only.'); process.exit(1); }

let total = 0n;
for (let index = 0; index < count; index++) {
  const account = mnemonicToAccount(mnemonic, { addressIndex: index });
  const [units, gas] = await Promise.all([
    client.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] }),
    client.getBalance({ address: account.address }),
  ]);
  if (units === 0n) continue;
  total += units;
  const line = `#${index} ${account.address}: ${formatUnits(units, 6)} USDC, ${formatEther(gas)} ETH for fees`;
  if (!send) { console.log(line); continue; }
  try {
    const wallet = createWalletClient({ account, chain: baseSepolia, transport });
    const hash = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: 'transfer', args: [getAddress(destination), units] });
    const receipt = await client.waitForTransactionReceipt({ hash });
    console.log(`${line} -> sent ${receipt.status} ${hash}`);
  } catch (error) {
    // Usually no ETH for the network fee on this address: send a little test ETH to it and run again.
    console.log(`${line} -> not sent: ${(error as Error).message.split('\n')[0]}`);
  }
}
console.log(`${send ? 'Swept' : 'Found'} ${formatUnits(total, 6)} USDC on the first ${count} deposit addresses${send ? '' : ' (dry run; add --send to move it)'}.`);
