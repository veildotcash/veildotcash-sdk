/**
 * Private Balance CLI command - Show private balance from Pool contract
 */

import { Command } from 'commander';
import { getPrivateBalance } from '../../balance.js';
import { Keypair } from '../../keypair.js';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';
import { clearProgress, createProgressReporter, printFields, printHeader, printJson } from '../output.js';
import type { RelayPool } from '../../types.js';

const SUPPORTED_POOLS: RelayPool[] = ['eth', 'usdc'];

function printPrivateBalanceHuman(result: Awaited<ReturnType<typeof getPrivateBalance>>, pool: RelayPool): void {
  printHeader(`Private ${pool.toUpperCase()} Balance`);
  printFields([
    { label: 'Balance', value: result.privateBalance },
    { label: 'UTXOs', value: result.utxoCount },
    { label: 'Unspent', value: result.unspentCount },
    { label: 'Spent', value: result.spentCount },
  ]);
}

export function createPrivateBalanceCommand(name = 'private-balance'): Command {
  const privateBalance = new Command(name)
    .description('Show private balance (requires VEIL_KEY)')
    .option('--pool <pool>', 'Pool to check (eth or usdc)', 'eth')
    .option('--json', 'Output as JSON')
    .addHelpText('after', `
Examples:
  veil balance private
  veil balance private --pool usdc
  veil balance private --json
`)
    .action(async (options) => {
      try {
        const pool = (options.pool || 'eth').toLowerCase() as RelayPool;
        if (!SUPPORTED_POOLS.includes(pool)) {
          throw new CLIError(ErrorCode.INVALID_AMOUNT, `Unsupported pool: ${options.pool}. Supported: ${SUPPORTED_POOLS.join(', ')}`);
        }

        const veilKey = process.env.VEIL_KEY;
        if (!veilKey) {
          throw new CLIError(ErrorCode.VEIL_KEY_MISSING, 'VEIL_KEY required. Set VEIL_KEY env');
        }

        const keypair = new Keypair(veilKey);
        const rpcUrl = process.env.RPC_URL;
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

        if (options.json) {
          printJson(output);
          return;
        }

        printPrivateBalanceHuman(result, pool);
      } catch (error) {
        clearProgress();
        handleCLIError(error);
      }
    });

  return privateBalance;
}
