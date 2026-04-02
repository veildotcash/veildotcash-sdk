/**
 * Private Balance CLI command - Show private balance from Pool contract
 */

import { Command } from 'commander';
import { getPrivateBalance } from '../../balance.js';
import { Keypair } from '../../keypair.js';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';
import { clearProgress, createProgressReporter, printFields, printHeader, printJson, printList } from '../output.js';
import type { RelayPool } from '../../types.js';

const SUPPORTED_POOLS: RelayPool[] = ['eth', 'usdc'];

function printPrivateBalanceHuman(result: Awaited<ReturnType<typeof getPrivateBalance>>, pool: RelayPool, showUtxos: boolean): void {
  printHeader(`Private ${pool.toUpperCase()} Balance`);
  printFields([
    { label: 'Balance', value: result.privateBalance },
    { label: 'UTXOs', value: result.utxoCount },
    { label: 'Unspent', value: result.unspentCount },
    { label: 'Spent', value: result.spentCount },
  ]);

  if (showUtxos) {
    printList(
      result.utxos.map((utxo) => `#${utxo.index}  ${utxo.amount} (${utxo.isSpent ? 'spent' : 'unspent'})`)
    );
  }
}

export function createPrivateBalanceCommand(name = 'private-balance'): Command {
  const privateBalance = new Command(name)
    .description('Show private balance (requires VEIL_KEY)')
    .option('--pool <pool>', 'Pool to check (eth or usdc)', 'eth')
    .option('--veil-key <key>', 'Veil private key (or set VEIL_KEY env)')
    .option('--rpc-url <url>', 'RPC URL (or set RPC_URL env)')
    .option('--show-utxos', 'Show individual UTXO details')
    .option('--json', 'Output as JSON')
    .addHelpText('after', `
Examples:
  veil balance private
  veil balance private --pool usdc --show-utxos
  veil balance private --json
`)
    .action(async (options) => {
      try {
        const pool = (options.pool || 'eth').toLowerCase() as RelayPool;
        if (!SUPPORTED_POOLS.includes(pool)) {
          throw new CLIError(ErrorCode.INVALID_AMOUNT, `Unsupported pool: ${options.pool}. Supported: ${SUPPORTED_POOLS.join(', ')}`);
        }

        const veilKey = options.veilKey || process.env.VEIL_KEY;
        if (!veilKey) {
          throw new CLIError(ErrorCode.VEIL_KEY_MISSING, 'Must provide --veil-key or set VEIL_KEY env');
        }

        const keypair = new Keypair(veilKey);
        const rpcUrl = options.rpcUrl || process.env.RPC_URL;
        const onProgress = createProgressReporter();
        const result = await getPrivateBalance({ keypair, pool, rpcUrl, onProgress });
        clearProgress();

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

        if (options.json) {
          printJson(output);
          return;
        }

        printPrivateBalanceHuman(result, pool, Boolean(options.showUtxos));
      } catch (error) {
        clearProgress();
        handleCLIError(error);
      }
    });

  return privateBalance;
}
