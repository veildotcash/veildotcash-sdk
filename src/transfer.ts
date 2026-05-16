/**
 * Transfer functions for Veil SDK
 * Build ZK proofs to transfer funds privately within the pool
 */

import { createPublicClient, http, parseUnits } from 'viem';
import { base } from 'viem/chains';
import { getAddresses, getPoolAddress, POOL_CONFIG } from './addresses.js';
import { POOL_ABI, ENTRY_ABI } from './abi.js';
import { Keypair } from './keypair.js';
import { Utxo } from './utxo.js';
import { getPrivateBalance } from './balance.js';
import { prepareTransaction } from './transaction.js';
import { submitRelay } from './relay.js';
import { selectUtxosForWithdraw } from './withdraw.js';
import type { 
  BuildTransferProofOptions, 
  ProofBuildResult, 
  TransferResult,
  RelayPool,
} from './types.js';

/**
 * Check if a recipient is registered and get their deposit key
 * 
 * @param address - Address to check
 * @param rpcUrl - Optional RPC URL
 * @returns Whether registered and their deposit key if so
 * 
 * @example
 * ```typescript
 * const { isRegistered, depositKey } = await checkRecipientRegistration('0x1234...');
 * if (!isRegistered) {
 *   console.log('Recipient needs to register first');
 * }
 * ```
 */
export async function checkRecipientRegistration(
  address: `0x${string}`,
  rpcUrl?: string
): Promise<{ isRegistered: boolean; depositKey?: string }> {
  const addresses = getAddresses();
  
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  const depositKey = await publicClient.readContract({
    address: addresses.entry,
    abi: ENTRY_ABI,
    functionName: 'depositKeys',
    args: [address],
  }) as string;

  // If depositKey exists and is not empty, recipient is registered
  const isRegistered = !!(depositKey && depositKey !== '0x' && depositKey.length > 2);

  return {
    isRegistered,
    depositKey: isRegistered ? depositKey : undefined,
  };
}

/**
 * Fetch all commitments from the pool contract
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

  onProgress?.('Fetching commitment count...');
  const nextIndex = await publicClient.readContract({
    address: poolAddress,
    abi: POOL_ABI,
    functionName: 'nextIndex',
  }) as number;

  if (nextIndex === 0) {
    return [];
  }

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
 * Build a transfer proof
 * 
 * This function:
 * 1. Verifies the recipient is registered
 * 2. Fetches the sender's unspent UTXOs
 * 3. Selects UTXOs to cover the transfer amount
 * 4. Creates output UTXOs for recipient and change
 * 5. Builds the ZK proof
 * 
 * @param options - Transfer options
 * @returns Proof data ready for relay submission
 * 
 * @example
 * ```typescript
 * const senderKeypair = new Keypair(process.env.VEIL_KEY);
 * const proof = await buildTransferProof({
 *   amount: '0.1',
 *   recipientAddress: '0x1234...',
 *   senderKeypair,
 * });
 * ```
 */
export async function buildTransferProof(
  options: BuildTransferProofOptions
): Promise<ProofBuildResult> {
  const {
    amount,
    recipientAddress,
    senderKeypair,
    pool = 'eth',
    rpcUrl,
    provingKeyPath,
    onProgress,
  } = options;

  const poolConfig = POOL_CONFIG[pool];
  const poolAddress = getPoolAddress(pool);

  // 1. Check recipient is registered and get their deposit key
  onProgress?.('Checking recipient registration...');
  const { isRegistered, depositKey } = await checkRecipientRegistration(
    recipientAddress,
    rpcUrl
  );

  if (!isRegistered || !depositKey) {
    throw new Error(`Recipient ${recipientAddress} is not registered. They need to register first.`);
  }

  // 2. Get sender's unspent UTXOs
  onProgress?.('Fetching your UTXOs...');
  const balanceResult = await getPrivateBalance({
    keypair: senderKeypair,
    pool,
    rpcUrl,
    onProgress,
  });

  const unspentUtxoInfos = balanceResult.utxos.filter(u => !u.isSpent);
  if (unspentUtxoInfos.length === 0) {
    throw new Error('No unspent UTXOs available for transfer');
  }

  // Re-decrypt UTXOs to get full Utxo objects
  onProgress?.('Preparing UTXOs...');
  
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

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
        const utxo = Utxo.decrypt(encryptedOutputs[0], senderKeypair);
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

  // 3. Select UTXOs for transfer
  onProgress?.('Selecting UTXOs...');
  const { selectedUtxos, changeAmount } = selectUtxosForWithdraw(
    utxos,
    amount,
    poolConfig.decimals
  );

  // 4. Create output UTXOs
  const outputs: Utxo[] = [];
  const transferWei = parseUnits(amount, poolConfig.decimals);

  // Create recipient UTXO using their deposit key
  const recipientKeypair = Keypair.fromString(depositKey);
  const recipientUtxo = new Utxo({
    amount: transferWei,
    keypair: recipientKeypair,
  });
  outputs.push(recipientUtxo);

  // Create change UTXO for sender if needed
  if (changeAmount > 0n) {
    const changeUtxo = new Utxo({
      amount: changeAmount,
      keypair: senderKeypair,
    });
    outputs.push(changeUtxo);
  }

  // 5. Fetch all commitments from pool
  const commitments = await fetchCommitments(rpcUrl, poolAddress, onProgress);

  // 6. Build the ZK proof
  // For transfers, recipient field is 0x0 (no external withdrawal)
  onProgress?.('Building ZK proof...');
  const result = await prepareTransaction({
    commitments,
    inputs: selectedUtxos,
    outputs,
    fee: 0,
    recipient: '0x0000000000000000000000000000000000000000',
    relayer: '0x0000000000000000000000000000000000000000',
    onProgress,
    provingKeyPath,
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
 * Execute a transfer by building proof and submitting to relay
 * 
 * @param options - Transfer options
 * @returns Transfer result with transaction hash
 * 
 * @example
 * ```typescript
 * const senderKeypair = new Keypair(process.env.VEIL_KEY);
 * const result = await transfer({
 *   amount: '0.1',
 *   recipientAddress: '0x1234...',
 *   senderKeypair,
 * });
 * 
 * console.log(`Transfer tx: ${result.transactionHash}`);
 * ```
 */
export async function transfer(
  options: BuildTransferProofOptions
): Promise<TransferResult> {
  const { amount, recipientAddress, pool = 'eth', onProgress } = options;

  // Build the proof
  const proof = await buildTransferProof(options);

  // Submit to relay
  onProgress?.('Submitting to relay...');
  const relayResult = await submitRelay({
    type: 'transfer',
    pool,
    proofArgs: proof.proofArgs,
    extData: proof.extData,
    metadata: {
      amount,
      recipient: recipientAddress,
      inputUtxoCount: proof.inputCount,
      outputUtxoCount: proof.outputCount,
    },
  });

  return {
    success: relayResult.success,
    transactionHash: relayResult.transactionHash,
    blockNumber: relayResult.blockNumber,
    amount,
    recipient: recipientAddress,
  };
}

/**
 * Merge UTXOs by doing a self-transfer
 * This consolidates multiple small UTXOs into fewer larger ones
 * 
 * Unlike regular transfers, merge doesn't need a recipient address - 
 * it uses the sender's keypair directly to create the output UTXO.
 * 
 * @param options - Merge options
 * @returns Transfer result
 * 
 * @example
 * ```typescript
 * const keypair = new Keypair(process.env.VEIL_KEY);
 * const result = await mergeUtxos({
 *   amount: '0.5', // Total amount to consolidate
 *   keypair,
 * });
 * ```
 */
export async function mergeUtxos(options: {
  amount: string;
  keypair: Keypair;
  pool?: RelayPool;
  rpcUrl?: string;
  provingKeyPath?: import('./prover.js').ProvingKeyPath;
  onProgress?: (stage: string, detail?: string) => void;
}): Promise<TransferResult> {
  const { amount, keypair, pool = 'eth', rpcUrl, provingKeyPath, onProgress } = options;

  const poolConfig = POOL_CONFIG[pool];
  const poolAddress = getPoolAddress(pool);

  // 1. Get sender's unspent UTXOs
  onProgress?.('Fetching your UTXOs...');
  const balanceResult = await getPrivateBalance({
    keypair,
    pool,
    rpcUrl,
    onProgress,
  });

  const unspentUtxoInfos = balanceResult.utxos.filter(u => !u.isSpent);
  if (unspentUtxoInfos.length === 0) {
    throw new Error('No unspent UTXOs available for merge');
  }

  // Re-decrypt UTXOs to get full Utxo objects
  onProgress?.('Preparing UTXOs...');
  
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

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

  // 2. Select UTXOs for merge
  onProgress?.('Selecting UTXOs...');
  const { selectedUtxos, changeAmount } = selectUtxosForWithdraw(
    utxos,
    amount,
    poolConfig.decimals
  );

  // 3. Create output UTXO - use sender's keypair directly (self-transfer)
  const outputs: Utxo[] = [];
  const mergeWei = parseUnits(amount, poolConfig.decimals);

  // Create merged UTXO using own keypair
  const mergedUtxo = new Utxo({
    amount: mergeWei,
    keypair: keypair,
  });
  outputs.push(mergedUtxo);

  // Create change UTXO if needed
  if (changeAmount > 0n) {
    const changeUtxo = new Utxo({
      amount: changeAmount,
      keypair: keypair,
    });
    outputs.push(changeUtxo);
  }

  // 4. Fetch all commitments from pool
  const commitments = await fetchCommitments(rpcUrl, poolAddress, onProgress);

  // 5. Build the ZK proof (recipient = 0x0 for self-transfer)
  onProgress?.('Building ZK proof...');
  const result = await prepareTransaction({
    commitments,
    inputs: selectedUtxos,
    outputs,
    fee: 0,
    recipient: '0x0000000000000000000000000000000000000000',
    relayer: '0x0000000000000000000000000000000000000000',
    onProgress,
    provingKeyPath,
  });

  // 6. Submit to relay
  onProgress?.('Submitting to relay...');
  const relayResult = await submitRelay({
    type: 'transfer',
    pool,
    proofArgs: {
      proof: result.args.proof,
      root: result.args.root,
      inputNullifiers: result.args.inputNullifiers,
      outputCommitments: result.args.outputCommitments as [string, string],
      publicAmount: result.args.publicAmount,
      extDataHash: result.args.extDataHash,
    },
    extData: result.extData,
    metadata: {
      amount,
      inputUtxoCount: selectedUtxos.length,
      outputUtxoCount: outputs.length,
    },
  });

  return {
    success: relayResult.success,
    transactionHash: relayResult.transactionHash,
    blockNumber: relayResult.blockNumber,
    amount,
    recipient: 'self',
  };
}
