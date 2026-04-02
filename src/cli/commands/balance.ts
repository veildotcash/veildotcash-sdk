/**
 * Balance CLI command - Show both queue and private balances
 */

import { Command } from 'commander';
import { getQueueBalance, getPrivateBalance } from '../../balance.js';
import { POOL_CONFIG } from '../../addresses.js';
import { Keypair } from '../../keypair.js';
import { getAddress, getWalletBalances } from '../wallet.js';
import { formatUnits } from 'viem';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';
import { clearProgress, createProgressReporter, maskValue, printFields, printHeader, printJson, printLine, printList, printSection } from '../output.js';
import { createPrivateBalanceCommand } from './private-balance.js';
import { createQueueBalanceCommand } from './queue-balance.js';
import type { RelayPool } from '../../types.js';

const SUPPORTED_POOLS: RelayPool[] = ['eth', 'usdc'];

/**
 * Fetch balance for a single pool and return structured output
 */
async function fetchPoolBalance(
  pool: RelayPool,
  address: `0x${string}`,
  keypair: Keypair | null,
  rpcUrl: string | undefined,
  onProgress: ((stage: string, detail?: string) => void) | undefined,
): Promise<Record<string, unknown>> {
  const poolConfig = POOL_CONFIG[pool];

  // Get queue balance
  const poolProgress = onProgress
    ? (stage: string, detail?: string) => onProgress(`[${pool.toUpperCase()}] ${stage}`, detail)
    : undefined;

  const queueResult = await getQueueBalance({ address, pool, rpcUrl, onProgress: poolProgress });

  // Get private balance if keypair available
  let privateResult = null;
  if (keypair) {
    privateResult = await getPrivateBalance({ keypair, pool, rpcUrl, onProgress: poolProgress });
  }

  // Calculate total balance
  const queueBalanceWei = BigInt(queueResult.queueBalanceWei);
  const privateBalanceWei = privateResult ? BigInt(privateResult.privateBalanceWei) : 0n;
  const totalBalanceWei = queueBalanceWei + privateBalanceWei;

  const result: Record<string, unknown> = {
    pool: pool.toUpperCase(),
    symbol: poolConfig.symbol,
    totalBalance: formatUnits(totalBalanceWei, poolConfig.decimals),
    totalBalanceWei: totalBalanceWei.toString(),
  };

  // Private balance
  if (privateResult) {
    const unspentUtxos = privateResult.utxos.filter(u => !u.isSpent);
    result.private = {
      balance: privateResult.privateBalance,
      balanceWei: privateResult.privateBalanceWei,
      utxoCount: privateResult.unspentCount,
      utxos: unspentUtxos.map(u => ({
        index: u.index,
        amount: u.amount,
      })),
    };
  } else {
    result.private = {
      balance: null,
      note: 'Set VEIL_KEY to see private balance',
    };
  }

  // Queue details
  result.queue = {
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

  return result;
}

export function createBalanceCommand(): Command {
  const balance = new Command('balance')
    .description('Show queue and private balances (all pools by default)')
    .option('--pool <pool>', 'Pool to check (eth, usdc, or all)', 'all')
    .option('--address <address>', 'Address to check (or derived from WALLET_KEY)')
    .option('--veil-key <key>', 'Veil private key (or set VEIL_KEY env)')
    .option('--rpc-url <url>', 'RPC URL (or set RPC_URL env)')
    .option('--json', 'Output as JSON')
    .addHelpText('after', `
Examples:
  veil balance
  veil balance --pool eth
  veil balance queue --pool usdc
  veil balance private --show-utxos
  veil balance --json
`)
    .action(async (options) => {
      try {
        const poolArg = (options.pool || 'all').toLowerCase();

        // Validate pool
        if (poolArg !== 'all' && !SUPPORTED_POOLS.includes(poolArg as RelayPool)) {
          throw new CLIError(ErrorCode.INVALID_AMOUNT, `Unsupported pool: ${options.pool}. Supported: ${SUPPORTED_POOLS.join(', ')}, all`);
        }

        const poolsToQuery: RelayPool[] = poolArg === 'all' ? [...SUPPORTED_POOLS] : [poolArg as RelayPool];

        // Get address
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

        // Get keypair for private balance
        const veilKey = options.veilKey || process.env.VEIL_KEY;
        const keypair = veilKey ? new Keypair(veilKey) : null;

        const rpcUrl = options.rpcUrl || process.env.RPC_URL;

        const onProgress = createProgressReporter();

        // Get deposit key if available
        const depositKey = process.env.DEPOSIT_KEY || (keypair ? keypair.depositKey() : null);

        // Single pool mode -- flat output (backwards compatible)
        if (poolsToQuery.length === 1) {
          const [poolResult, walletBalances] = await Promise.all([
            fetchPoolBalance(poolsToQuery[0], address, keypair, rpcUrl, onProgress),
            getWalletBalances(address, rpcUrl),
          ]);

          clearProgress();

          const output = {
            address,
            depositKey: depositKey || null,
            wallet: walletBalances,
            ...poolResult,
          };

          if (options.json) {
            printJson(output);
            return;
          }

          printCombinedBalanceHuman(output);
          return;
        }

        // All pools mode -- nested output
        const poolPromises = poolsToQuery.map(pool =>
          fetchPoolBalance(pool, address, keypair, rpcUrl, onProgress),
        );
        const [walletBalances, ...poolResults] = await Promise.all([
          getWalletBalances(address, rpcUrl),
          ...poolPromises,
        ]);

        clearProgress();

        const output = {
          address,
          depositKey: depositKey || null,
          wallet: walletBalances,
          pools: poolResults,
        };

        if (options.json) {
          printJson(output);
          return;
        }

        printMultiPoolBalanceHuman(output);
      } catch (error) {
        clearProgress();
        handleCLIError(error);
      }
    });

  balance.addCommand(createQueueBalanceCommand('queue'));
  balance.addCommand(createPrivateBalanceCommand('private'));

  return balance;
}

function printPoolHuman(output: Record<string, unknown>): void {
  const symbol = output.symbol as string;

  printSection(`${output.pool}`);
  printFields([
    { label: 'Total', value: `${output.totalBalance} ${symbol}` },
  ]);

  const privateData = output.private as { balance?: string | null; balanceWei?: string; utxoCount?: number; note?: string; utxos?: Array<{ index: number; amount: string }> };
  if (privateData.note) {
    printFields([
      { label: 'Private', value: privateData.note },
    ]);
  } else {
    printFields([
      { label: 'Private', value: `${privateData.balance} ${symbol}` },
    ]);
  }

  const queueData = output.queue as { balance: string; balanceWei: string; count: number; deposits: Array<{ nonce: string | number; amount: string; status: string }> };
  printFields([
    { label: 'Queue', value: `${queueData.balance} ${symbol}` },
    { label: 'Pending', value: queueData.count },
  ]);
  if (queueData.deposits.length > 0) {
    printList(
      queueData.deposits.map((d) => `nonce ${d.nonce}: ${d.amount} (${d.status})`)
    );
  }
}

function printCombinedBalanceHuman(output: Record<string, unknown>): void {
  const wallet = output.wallet as { eth: string; usdc: string };

  printHeader(`${output.pool} Balance`);
  printFields([
    { label: 'Address', value: output.address },
    { label: 'Deposit key', value: typeof output.depositKey === 'string' ? maskValue(output.depositKey) : 'not set' },
  ]);

  printSection('Wallet (public)');
  printFields([
    { label: 'ETH', value: `${wallet.eth} ETH` },
    { label: 'USDC', value: `${wallet.usdc} USDC` },
  ]);

  printPoolHuman(output);
  printLine();
}

function printMultiPoolBalanceHuman(output: { address: string; depositKey: string | null; wallet: { eth: string; usdc: string }; pools: Record<string, unknown>[] }): void {
  printHeader('Balances');
  printFields([
    { label: 'Address', value: output.address },
    { label: 'Deposit key', value: output.depositKey ? maskValue(output.depositKey) : 'not set' },
  ]);

  printSection('Wallet (public)');
  printFields([
    { label: 'ETH', value: `${output.wallet.eth} ETH` },
    { label: 'USDC', value: `${output.wallet.usdc} USDC` },
  ]);

  for (const poolResult of output.pools) {
    printPoolHuman(poolResult);
  }

  printLine();
}
