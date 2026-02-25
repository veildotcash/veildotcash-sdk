/**
 * Queue Balance CLI command - Show queue balance and pending deposits
 */

import { Command } from 'commander';
import { getQueueBalance } from '../../balance.js';
import { getAddress } from '../wallet.js';
import type { RelayPool } from '../../types.js';

export function createQueueBalanceCommand(): Command {
  const balance = new Command('queue-balance')
    .description('Show queue balance and pending deposits')
    .option('--pool <pool>', 'Pool to check (eth or usdc)', 'eth')
    .option('--wallet-key <key>', 'Ethereum wallet key (or set WALLET_KEY env)')
    .option('--address <address>', 'Address to check (or derived from wallet key)')
    .option('--rpc-url <url>', 'RPC URL (or set RPC_URL env)')
    .option('--quiet', 'Suppress progress output')
    .action(async (options) => {
      try {
        const pool = (options.pool || 'eth').toLowerCase() as RelayPool;

        // Get address
        let address: `0x${string}`;
        if (options.address) {
          address = options.address as `0x${string}`;
        } else {
          const walletKey = options.walletKey || process.env.WALLET_KEY;
          if (!walletKey) {
            throw new Error('Must provide --address or --wallet-key (or set WALLET_KEY env)');
          }
          address = getAddress(walletKey as `0x${string}`);
        }

        // Progress callback - writes to stderr so JSON output is clean
        const onProgress = options.quiet 
          ? undefined 
          : (stage: string, detail?: string) => {
              const msg = detail ? `${stage}: ${detail}` : stage;
              process.stderr.write(`\r\x1b[K${msg}`);
            };

        // Get queue balance from SDK
        const rpcUrl = options.rpcUrl || process.env.RPC_URL;
        const result = await getQueueBalance({ address, pool, rpcUrl, onProgress });

        // Clear progress line
        if (!options.quiet) {
          process.stderr.write('\r\x1b[K');
        }

        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        // Clear progress line on error
        process.stderr.write('\r\x1b[K');
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ success: false, error: errorMessage }));
        process.exit(1);
      }
    });

  return balance;
}
