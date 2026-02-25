/**
 * Balance CLI command - Show both queue and private balances
 */

import { Command } from 'commander';
import { getQueueBalance, getPrivateBalance } from '../../balance.js';
import { POOL_CONFIG } from '../../addresses.js';
import { Keypair } from '../../keypair.js';
import { getAddress } from '../wallet.js';
import { formatUnits } from 'viem';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';
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
    .option('--wallet-key <key>', 'Ethereum wallet key (or set WALLET_KEY env)')
    .option('--address <address>', 'Address to check (or derived from wallet key)')
    .option('--veil-key <key>', 'Veil private key (or set VEIL_KEY env)')
    .option('--rpc-url <url>', 'RPC URL (or set RPC_URL env)')
    .option('--quiet', 'Suppress progress output')
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

        // Get deposit key if available
        const depositKey = process.env.DEPOSIT_KEY || (keypair ? keypair.depositKey() : null);

        // Single pool mode -- flat output (backwards compatible)
        if (poolsToQuery.length === 1) {
          const poolResult = await fetchPoolBalance(poolsToQuery[0], address, keypair, rpcUrl, onProgress);

          // Clear progress line
          if (!options.quiet) process.stderr.write('\r\x1b[K');

          const output = {
            address,
            depositKey: depositKey || null,
            ...poolResult,
          };

          console.log(JSON.stringify(output, null, 2));
          return;
        }

        // All pools mode -- nested output
        const pools: Record<string, unknown>[] = [];
        for (const pool of poolsToQuery) {
          const poolResult = await fetchPoolBalance(pool, address, keypair, rpcUrl, onProgress);
          pools.push(poolResult);
        }

        // Clear progress line
        if (!options.quiet) process.stderr.write('\r\x1b[K');

        const output = {
          address,
          depositKey: depositKey || null,
          pools,
        };

        console.log(JSON.stringify(output, null, 2));
      } catch (error) {
        process.stderr.write('\r\x1b[K');
        handleCLIError(error);
      }
    });

  return balance;
}
