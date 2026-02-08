/**
 * Private Balance CLI command - Show private balance from Pool contract
 */

import { Command } from 'commander';
import { getPrivateBalance } from '../../balance.js';
import { Keypair } from '../../keypair.js';
import type { RelayPool } from '../../types.js';

export function createPrivateBalanceCommand(): Command {
  const privateBalance = new Command('private-balance')
    .description('Show private balance (requires VEIL_KEY)')
    .option('--pool <pool>', 'Pool to check (eth, usdc, or btc)', 'eth')
    .option('--veil-key <key>', 'Veil private key (or set VEIL_KEY env)')
    .option('--rpc-url <url>', 'RPC URL (or set RPC_URL env)')
    .option('--show-utxos', 'Show individual UTXO details')
    .option('--quiet', 'Suppress progress output')
    .action(async (options) => {
      try {
        const pool = (options.pool || 'eth').toLowerCase() as RelayPool;

        // Get keypair
        const veilKey = options.veilKey || process.env.VEIL_KEY;
        if (!veilKey) {
          throw new Error('Must provide --veil-key or set VEIL_KEY env');
        }

        const keypair = new Keypair(veilKey);
        const rpcUrl = options.rpcUrl || process.env.RPC_URL;

        // Progress callback - writes to stderr so JSON output is clean
        const onProgress = options.quiet 
          ? undefined 
          : (stage: string, detail?: string) => {
              const msg = detail ? `${stage}: ${detail}` : stage;
              process.stderr.write(`\r\x1b[K${msg}`);
            };

        // Get private balance from SDK
        const result = await getPrivateBalance({ keypair, pool, rpcUrl, onProgress });

        // Clear progress line
        if (!options.quiet) {
          process.stderr.write('\r\x1b[K');
        }

        // Format output
        const output: Record<string, unknown> = {
          pool: pool.toUpperCase(),
          privateBalance: result.privateBalance,
          privateBalanceWei: result.privateBalanceWei,
          utxoCount: result.utxoCount,
          unspentCount: result.unspentCount,
          spentCount: result.spentCount,
        };

        // Optionally include UTXO details
        if (options.showUtxos) {
          output.utxos = result.utxos;
        }

        console.log(JSON.stringify(output, null, 2));
      } catch (error) {
        // Clear progress line on error
        process.stderr.write('\r\x1b[K');
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ success: false, error: errorMessage }));
        process.exit(1);
      }
    });

  return privateBalance;
}
