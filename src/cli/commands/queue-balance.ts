/**
 * Queue Balance CLI command - Show queue balance and pending deposits
 */

import { Command } from 'commander';
import { getQueueBalance } from '../../balance.js';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';
import { clearProgress, createProgressReporter, printFields, printHeader, printJson, printList } from '../output.js';
import { getAddress } from '../wallet.js';
import type { RelayPool } from '../../types.js';

const SUPPORTED_POOLS: RelayPool[] = ['eth', 'usdc'];

function printQueueBalanceHuman(result: Awaited<ReturnType<typeof getQueueBalance>>, pool: RelayPool): void {
  printHeader(`Queue ${pool.toUpperCase()} Balance`);
  printFields([
    { label: 'Address', value: result.address },
    { label: 'Balance', value: result.queueBalance },
    { label: 'Pending', value: result.pendingCount },
  ]);
  if (result.pendingDeposits.length > 0) {
    printList(
      result.pendingDeposits.map((deposit) => `nonce ${deposit.nonce}: ${deposit.amount} (${deposit.status})`)
    );
  }
}

export function createQueueBalanceCommand(name = 'queue-balance'): Command {
  const balance = new Command(name)
    .description('Show queue balance and pending deposits')
    .option('--pool <pool>', 'Pool to check (eth or usdc)', 'eth')
    .option('--address <address>', 'Address to check (or derived from WALLET_KEY)')
    .option('--rpc-url <url>', 'RPC URL (or set RPC_URL env)')
    .option('--json', 'Output as JSON')
    .addHelpText('after', `
Examples:
  veil balance queue
  veil balance queue --pool usdc
  veil balance queue --address 0x... --json
`)
    .action(async (options) => {
      try {
        const pool = (options.pool || 'eth').toLowerCase() as RelayPool;
        if (!SUPPORTED_POOLS.includes(pool)) {
          throw new CLIError(ErrorCode.INVALID_AMOUNT, `Unsupported pool: ${options.pool}. Supported: ${SUPPORTED_POOLS.join(', ')}`);
        }

        let address: `0x${string}`;
        if (options.address) {
          address = options.address as `0x${string}`;
        } else {
          const walletKey = process.env.WALLET_KEY;
          if (!walletKey) {
            throw new CLIError(ErrorCode.WALLET_KEY_MISSING, 'Must provide --address or set WALLET_KEY env');
          }
          address = getAddress(walletKey as `0x${string}`);
        }

        const rpcUrl = options.rpcUrl || process.env.RPC_URL;
        const onProgress = createProgressReporter();
        const result = await getQueueBalance({ address, pool, rpcUrl, onProgress });
        clearProgress();

        if (options.json) {
          printJson(result);
          return;
        }

        printQueueBalanceHuman(result, pool);
      } catch (error) {
        clearProgress();
        handleCLIError(error);
      }
    });

  return balance;
}
