/**
 * Balance CLI command - Show both queue and private balances
 */

import { Command } from 'commander';
import { getQueueBalance, getPrivateBalance } from '../../balance.js';
import { Keypair } from '../../keypair.js';
import { getAddress } from '../wallet.js';
import { formatEther } from 'viem';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';

export function createBalanceCommand(): Command {
  const balance = new Command('balance')
    .description('Show queue and private balances')
    .option('--wallet-key <key>', 'Ethereum wallet key (or set WALLET_KEY env)')
    .option('--address <address>', 'Address to check (or derived from wallet key)')
    .option('--veil-key <key>', 'Veil private key (or set VEIL_KEY env)')
    .option('--rpc-url <url>', 'RPC URL (or set RPC_URL env)')
    .option('--quiet', 'Suppress progress output')
    .action(async (options) => {
      try {
        // Get address
        let address: `0x${string}`;
        if (options.address) {
          address = options.address as `0x${string}`;
        } else {
          const walletKey = options.walletKey || process.env.WALLET_KEY;
          if (!walletKey) {
            throw new CLIError(ErrorCode.WALLET_KEY_MISSING, 'Must provide --address or --wallet-key (or set WALLET_KEY env)');
          }
          address = getAddress(walletKey as `0x${string}`);
        }

        // Get keypair for private balance
        const veilKey = options.veilKey || process.env.VEIL_KEY;
        const keypair = veilKey ? new Keypair(veilKey) : null;

        const rpcUrl = options.rpcUrl || process.env.RPC_URL;

        // Progress callback
        const onProgress = options.quiet 
          ? undefined 
          : (stage: string, detail?: string) => {
              const msg = detail ? `${stage}: ${detail}` : stage;
              process.stderr.write(`\r\x1b[K${msg}`);
            };

        // Get queue balance
        const queueResult = await getQueueBalance({ address, rpcUrl, onProgress });

        // Get private balance if keypair available
        let privateResult = null;
        if (keypair) {
          privateResult = await getPrivateBalance({ keypair, rpcUrl, onProgress });
        }

        // Clear progress line
        if (!options.quiet) {
          process.stderr.write('\r\x1b[K');
        }

        // Calculate total balance
        const queueBalanceWei = BigInt(queueResult.queueBalanceWei);
        const privateBalanceWei = privateResult ? BigInt(privateResult.privateBalanceWei) : 0n;
        const totalBalanceWei = queueBalanceWei + privateBalanceWei;

        // Get deposit key if available
        const depositKey = process.env.DEPOSIT_KEY || (keypair ? keypair.depositKey() : null);

        // Build output structure
        const output: Record<string, unknown> = {
          address,
          depositKey: depositKey || null,
          totalBalance: formatEther(totalBalanceWei),
          totalBalanceWei: totalBalanceWei.toString(),
        };

        // Private balance first
        if (privateResult) {
          const unspentUtxos = privateResult.utxos.filter(u => !u.isSpent);
          output.private = {
            balance: privateResult.privateBalance,
            balanceWei: privateResult.privateBalanceWei,
            utxoCount: privateResult.unspentCount,
            utxos: unspentUtxos.map(u => ({
              index: u.index,
              amount: u.amount,
            })),
          };
        } else {
          output.private = {
            balance: null,
            note: 'Set VEIL_KEY to see private balance',
          };
        }

        // Queue details second
        output.queue = {
          balance: queueResult.queueBalance,
          balanceWei: queueResult.queueBalanceWei,
          count: queueResult.pendingCount,
          deposits: queueResult.pendingDeposits.map(d => ({
            nonce: d.nonce,
            amount: d.amount,
            status: d.status,
            timestamp: d.timestamp,
          })),
        };

        console.log(JSON.stringify(output, null, 2));
      } catch (error) {
        process.stderr.write('\r\x1b[K');
        handleCLIError(error);
      }
    });

  return balance;
}
