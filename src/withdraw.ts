/**
 * Withdrawal functions for Veil SDK
 * Build ZK proofs to withdraw funds from the pool to a public address
 */

import { createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { getPoolAddress, POOL_CONFIG } from './addresses.js';
import { POOL_ABI } from './abi.js';
import { Keypair } from './keypair.js';
import { Utxo } from './utxo.js';
import { getPrivateBalance } from './balance.js';
import { prepareTransaction } from './transaction.js';
import { submitRelay } from './relay.js';
import type { 
  BuildWithdrawProofOptions, 
  ProofBuildResult, 
  WithdrawResult,
  UtxoSelectionResult,
} from './types.js';

/**
 * Select UTXOs for withdrawal using largest-first algorithm
 * 
 * @param utxos - Available unspent UTXOs
 * @param amount - Amount to withdraw (human readable)
 * @param decimals - Token decimals (default: 18 for ETH)
 * @returns Selected UTXOs and change amount
 */
export function selectUtxosForWithdraw(
  utxos: Utxo[],
  amount: string,
  decimals: number = 18
): UtxoSelectionResult {
  const withdrawWei = parseUnits(amount, decimals);
  
  // Sort UTXOs by amount (largest first)
  const sortedUtxos = [...utxos].sort((a, b) => Number(b.amount - a.amount));
  
  let totalSelected = 0n;
  const selectedUtxos: Utxo[] = [];
  
  for (const utxo of sortedUtxos) {
    selectedUtxos.push(utxo);
    totalSelected += utxo.amount;
    
    if (totalSelected >= withdrawWei) {
      break;
    }
  }
  
  if (totalSelected < withdrawWei) {
    throw new Error(
      `Insufficient balance. Need ${amount}, have ${formatUnits(totalSelected, decimals)}`
    );
  }
  
  const changeAmount = totalSelected - withdrawWei;
  
  return { selectedUtxos, totalSelected, changeAmount };
}

/**
 * Fetch all commitments from the pool contract
 * 
 * @param rpcUrl - RPC URL
 * @param poolAddress - Pool contract address
 * @param onProgress - Progress callback
 * @returns Array of commitment hashes
 */
async function fetchCommitments(
  rpcUrl: string | undefined,
  poolAddress: `0x${string}`,
  onProgress?: (stage: string, detail?: string) => void
): Promise<string[]> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  // Get total count
  onProgress?.('Fetching commitment count...');
  const nextIndex = await publicClient.readContract({
    address: poolAddress,
    abi: POOL_ABI,
    functionName: 'nextIndex',
  }) as number;

  if (nextIndex === 0) {
    return [];
  }

  // Fetch commitments in batches
  const BATCH_SIZE = 5000;
  const commitments: string[] = [];
  const totalBatches = Math.ceil(nextIndex / BATCH_SIZE);

  for (let start = 0; start < nextIndex; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, nextIndex);
    const batchNum = Math.floor(start / BATCH_SIZE) + 1;
    onProgress?.('Fetching commitments', `batch ${batchNum}/${totalBatches}`);

    const batch = await publicClient.readContract({
      address: poolAddress,
      abi: POOL_ABI,
      functionName: 'getCommitments',
      args: [BigInt(start), BigInt(end)],
    }) as `0x${string}`[];

    commitments.push(...batch.map(c => c.toString()));
  }

  return commitments;
}

/**
 * Build a withdrawal proof
 * 
 * This function:
 * 1. Fetches the user's unspent UTXOs
 * 2. Selects UTXOs to cover the withdrawal amount
 * 3. Fetches all commitments from the pool
 * 4. Builds the ZK proof
 * 
 * @param options - Withdrawal options
 * @returns Proof data ready for relay submission
 * 
 * @example
 * ```typescript
 * const keypair = new Keypair(process.env.VEIL_KEY);
 * const proof = await buildWithdrawProof({
 *   amount: '0.1',
 *   recipient: '0x1234...',
 *   keypair,
 *   onProgress: (stage, detail) => console.log(stage, detail),
 * });
 * ```
 */
export async function buildWithdrawProof(
  options: BuildWithdrawProofOptions
): Promise<ProofBuildResult> {
  const {
    amount,
    recipient,
    keypair,
    pool = 'eth',
    rpcUrl,
    onProgress,
  } = options;

  const poolConfig = POOL_CONFIG[pool];
  const poolAddress = getPoolAddress(pool);

  // 1. Get user's unspent UTXOs
  onProgress?.('Fetching your UTXOs...');
  const balanceResult = await getPrivateBalance({
    keypair,
    pool,
    rpcUrl,
    onProgress,
  });

  // Filter to only unspent UTXOs and recreate Utxo objects with keypair
  const unspentUtxoInfos = balanceResult.utxos.filter(u => !u.isSpent);
  if (unspentUtxoInfos.length === 0) {
    throw new Error('No unspent UTXOs available for withdrawal');
  }

  // We need to re-decrypt the UTXOs to get full Utxo objects
  // For now, we'll fetch encrypted outputs and decrypt again
  onProgress?.('Preparing UTXOs...');
  
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  // Fetch encrypted outputs for our unspent UTXOs
  const utxos: Utxo[] = [];
  for (const utxoInfo of unspentUtxoInfos) {
    const encryptedOutputs = await publicClient.readContract({
      address: poolAddress,
      abi: POOL_ABI,
      functionName: 'getEncryptedOutputs',
      args: [BigInt(utxoInfo.index), BigInt(utxoInfo.index + 1)],
    }) as string[];

    if (encryptedOutputs.length > 0) {
      try {
        const utxo = Utxo.decrypt(encryptedOutputs[0], keypair);
        utxo.index = utxoInfo.index;
        utxos.push(utxo);
      } catch {
        // Skip if decryption fails
      }
    }
  }

  if (utxos.length === 0) {
    throw new Error('Failed to decrypt UTXOs');
  }

  // 2. Select UTXOs for withdrawal
  onProgress?.('Selecting UTXOs...');
  const { selectedUtxos, changeAmount } = selectUtxosForWithdraw(
    utxos,
    amount,
    poolConfig.decimals
  );

  // 3. Create output UTXOs (just change, since withdrawal goes to external address)
  const outputs: Utxo[] = [];
  if (changeAmount > 0n) {
    const changeUtxo = new Utxo({
      amount: changeAmount,
      keypair: keypair,
    });
    outputs.push(changeUtxo);
  }

  // 4. Fetch all commitments from pool
  const commitments = await fetchCommitments(rpcUrl, poolAddress, onProgress);

  // 5. Build the ZK proof
  onProgress?.('Building ZK proof...');
  const result = await prepareTransaction({
    commitments,
    inputs: selectedUtxos,
    outputs,
    fee: 0,
    recipient,
    relayer: '0x0000000000000000000000000000000000000000',
    onProgress,
  });

  return {
    proofArgs: {
      proof: result.args.proof,
      root: result.args.root,
      inputNullifiers: result.args.inputNullifiers,
      outputCommitments: result.args.outputCommitments as [string, string],
      publicAmount: result.args.publicAmount,
      extDataHash: result.args.extDataHash,
    },
    extData: result.extData,
    inputCount: selectedUtxos.length,
    outputCount: outputs.length,
    amount,
  };
}

/**
 * Execute a withdrawal by building proof and submitting to relay
 * 
 * @param options - Withdrawal options
 * @returns Withdrawal result with transaction hash
 * 
 * @example
 * ```typescript
 * const keypair = new Keypair(process.env.VEIL_KEY);
 * const result = await withdraw({
 *   amount: '0.1',
 *   recipient: '0x1234...',
 *   keypair,
 * });
 * 
 * console.log(`Withdrawal tx: ${result.transactionHash}`);
 * ```
 */
export async function withdraw(
  options: BuildWithdrawProofOptions
): Promise<WithdrawResult> {
  const { amount, recipient, pool = 'eth', onProgress } = options;

  // Build the proof
  const proof = await buildWithdrawProof(options);

  // Submit to relay
  onProgress?.('Submitting to relay...');
  const relayResult = await submitRelay({
    type: 'withdraw',
    pool,
    proofArgs: proof.proofArgs,
    extData: proof.extData,
    metadata: {
      amount,
      recipient,
      inputUtxoCount: proof.inputCount,
      outputUtxoCount: proof.outputCount,
    },
  });

  return {
    success: relayResult.success,
    transactionHash: relayResult.transactionHash,
    blockNumber: relayResult.blockNumber,
    amount,
    recipient,
  };
}
