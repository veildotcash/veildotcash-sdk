/**
 * Balance functions for Veil SDK
 * Query queue and private balances directly from blockchain
 */

import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';
import { getAddresses } from './addresses.js';
import { QUEUE_ABI, POOL_ABI } from './abi.js';
import { Keypair } from './keypair.js';
import { Utxo } from './utxo.js';
import { toFixedHex } from './utils.js';
import type { 
  QueueBalanceResult, 
  PendingDeposit, 
  PrivateBalanceResult,
  UtxoInfo,
} from './types.js';

// Deposit status enum from Queue contract
const DEPOSIT_STATUS_MAP = {
  0: 'pending',
  1: 'accepted',
  2: 'rejected',
  3: 'refunded',
} as const;

/**
 * Progress callback type
 */
export type ProgressCallback = (stage: string, detail?: string) => void;

/**
 * Get queue balance and pending deposits for an address
 * Queries the Queue contract directly (no API dependency)
 * 
 * @param options - Query options
 * @param options.address - Address to check
 * @param options.rpcUrl - Optional RPC URL (uses default if not provided)
 * @param options.onProgress - Optional progress callback
 * @returns Queue balance and pending deposits
 * 
 * @example
 * ```typescript
 * const result = await getQueueBalance({
 *   address: '0x...',
 *   onProgress: (stage, detail) => console.log(stage, detail),
 * });
 * 
 * console.log(`Queue balance: ${result.queueBalance} ETH`);
 * console.log(`Pending deposits: ${result.pendingCount}`);
 * ```
 */
export async function getQueueBalance(options: {
  address: `0x${string}`;
  rpcUrl?: string;
  onProgress?: ProgressCallback;
}): Promise<QueueBalanceResult> {
  const { address, rpcUrl, onProgress } = options;
  const addresses = getAddresses();

  // Create public client
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  // Get all pending deposit nonces
  onProgress?.('Fetching pending deposits...');
  const pendingNonces = await publicClient.readContract({
    address: addresses.ethQueue,
    abi: QUEUE_ABI,
    functionName: 'getPendingDeposits',
  }) as bigint[];
  onProgress?.('Queue status', `${pendingNonces.length} pending deposits in queue`);

  // Fetch deposit details for each pending nonce
  const pendingDeposits: PendingDeposit[] = [];
  let totalQueueBalance = 0n;

  for (let i = 0; i < pendingNonces.length; i++) {
    const nonce = pendingNonces[i];
    onProgress?.('Checking deposit', `${i + 1}/${pendingNonces.length}`);
    
    const deposit = await publicClient.readContract({
      address: addresses.ethQueue,
      abi: QUEUE_ABI,
      functionName: 'getDeposit',
      args: [nonce],
    }) as {
      fallbackReceiver: `0x${string}`;
      amountIn: bigint;
      fee: bigint;
      shieldAmount: bigint;
      timestamp: bigint;
      status: number;
      depositKey: `0x${string}`;
    };

    // Check if this deposit belongs to the user
    if (deposit.fallbackReceiver.toLowerCase() === address.toLowerCase()) {
      totalQueueBalance += deposit.amountIn;
      pendingDeposits.push({
        nonce: nonce.toString(),
        status: DEPOSIT_STATUS_MAP[deposit.status as keyof typeof DEPOSIT_STATUS_MAP] || 'pending',
        amount: formatEther(deposit.amountIn),
        amountWei: deposit.amountIn.toString(),
        timestamp: new Date(Number(deposit.timestamp) * 1000).toISOString(),
      });
    }
  }

  if (pendingDeposits.length > 0) {
    onProgress?.('Found', `${pendingDeposits.length} deposits for your address`);
  }

  return {
    address,
    queueBalance: formatEther(totalQueueBalance),
    queueBalanceWei: totalQueueBalance.toString(),
    pendingDeposits,
    pendingCount: pendingDeposits.length,
  };
}

/**
 * Get private balance from the Pool contract
 * Decrypts all encrypted outputs, calculates nullifiers, and checks spent status
 * 
 * @param options - Query options
 * @param options.keypair - Keypair to decrypt UTXOs with
 * @param options.rpcUrl - Optional RPC URL (uses default if not provided)
 * @param options.onProgress - Optional progress callback
 * @returns Private balance and UTXO details
 * 
 * @example
 * ```typescript
 * const keypair = new Keypair(process.env.VEIL_KEY);
 * const result = await getPrivateBalance({ 
 *   keypair,
 *   onProgress: (stage, detail) => console.log(stage, detail),
 * });
 * 
 * console.log(`Private balance: ${result.privateBalance} ETH`);
 * console.log(`Unspent UTXOs: ${result.unspentCount}`);
 * ```
 */
export async function getPrivateBalance(options: {
  keypair: Keypair;
  rpcUrl?: string;
  onProgress?: ProgressCallback;
}): Promise<PrivateBalanceResult> {
  const { keypair, rpcUrl, onProgress } = options;
  const addresses = getAddresses();

  if (!keypair.privkey) {
    throw new Error('Keypair must have a private key to calculate private balance');
  }

  // Create public client
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  // 1. Get total count of encrypted outputs
  onProgress?.('Fetching pool index...');
  const nextIndex = await publicClient.readContract({
    address: addresses.ethPool,
    abi: POOL_ABI,
    functionName: 'nextIndex',
  }) as number;
  onProgress?.('Pool index', `${nextIndex} commitments`);

  if (nextIndex === 0) {
    return {
      privateBalance: '0',
      privateBalanceWei: '0',
      utxoCount: 0,
      spentCount: 0,
      unspentCount: 0,
      utxos: [],
    };
  }

  // 2. Fetch encrypted outputs in batches of 5000
  const BATCH_SIZE = 5000;
  const allEncryptedOutputs: string[] = [];
  const totalBatches = Math.ceil(nextIndex / BATCH_SIZE);

  for (let start = 0; start < nextIndex; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, nextIndex);
    const batchNum = Math.floor(start / BATCH_SIZE) + 1;
    onProgress?.('Fetching encrypted outputs', `batch ${batchNum}/${totalBatches} (${start}-${end})`);
    
    const batch = await publicClient.readContract({
      address: addresses.ethPool,
      abi: POOL_ABI,
      functionName: 'getEncryptedOutputs',
      args: [BigInt(start), BigInt(end)],
    }) as string[];
    allEncryptedOutputs.push(...batch);
  }

  // 3. Decrypt outputs - only user's UTXOs will decrypt successfully
  onProgress?.('Decrypting outputs', `scanning ${allEncryptedOutputs.length} outputs...`);
  const decryptedUtxos: { utxo: Utxo; index: number }[] = [];

  for (let i = 0; i < allEncryptedOutputs.length; i++) {
    try {
      const utxo = Utxo.decrypt(allEncryptedOutputs[i], keypair);
      utxo.index = i;
      // Only include UTXOs with non-zero amounts
      if (utxo.amount > 0n) {
        decryptedUtxos.push({ utxo, index: i });
      }
    } catch {
      // Not our UTXO - decryption fails, skip
    }
  }
  onProgress?.('Found UTXOs', `${decryptedUtxos.length} belonging to you`);

  // 4. Check spent status for each UTXO
  const utxoInfos: UtxoInfo[] = [];
  let totalBalance = 0n;
  let spentCount = 0;
  let unspentCount = 0;

  for (let i = 0; i < decryptedUtxos.length; i++) {
    const { utxo, index } = decryptedUtxos[i];
    onProgress?.('Checking spent status', `UTXO ${i + 1}/${decryptedUtxos.length}`);
    
    const nullifier = utxo.getNullifier();
    const nullifierHex = toFixedHex(nullifier) as `0x${string}`;

    const isSpent = await publicClient.readContract({
      address: addresses.ethPool,
      abi: POOL_ABI,
      functionName: 'isSpent',
      args: [nullifierHex],
    }) as boolean;

    utxoInfos.push({
      index,
      amount: formatEther(utxo.amount),
      amountWei: utxo.amount.toString(),
      isSpent,
    });

    if (isSpent) {
      spentCount++;
    } else {
      unspentCount++;
      totalBalance += utxo.amount;
    }
  }

  return {
    privateBalance: formatEther(totalBalance),
    privateBalanceWei: totalBalance.toString(),
    utxoCount: decryptedUtxos.length,
    spentCount,
    unspentCount,
    utxos: utxoInfos,
  };
}
