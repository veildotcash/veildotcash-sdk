/**
 * Transaction preparation for Veil SDK
 * Core function to build ZK proofs for withdrawals and transfers
 */

import { buildMerkleTree, MERKLE_TREE_HEIGHT } from './merkle.js';
import { prove, selectCircuit, type ProofInput } from './prover.js';
import { toFixedHex, getExtDataHash, shuffle, FIELD_SIZE } from './utils.js';
import { Utxo } from './utxo.js';

/**
 * External data for a transaction (sent alongside proof)
 */
export interface ExtData {
  recipient: string;
  extAmount: string;
  relayer: string;
  fee: string;
  encryptedOutput1: string;
  encryptedOutput2: string;
}

/**
 * Proof arguments for on-chain verification
 */
export interface ProofArgs {
  proof: string;
  root: string;
  inputNullifiers: string[];
  outputCommitments: string[];
  publicAmount: string;
  extDataHash: string;
}

/**
 * Result of preparing a transaction
 */
export interface TransactionResult {
  args: ProofArgs;
  extData: ExtData;
}

/**
 * Parameters for preparing a transaction
 */
export interface PrepareTransactionParams {
  /** All commitments from the merkle tree (from pool contract) */
  commitments: (string | bigint)[];
  /** Input UTXOs to spend */
  inputs?: Utxo[];
  /** Output UTXOs to create */
  outputs?: Utxo[];
  /** Transaction fee (usually 0 for relay) */
  fee?: bigint | number;
  /** Recipient address for withdrawals (0x0 for transfers) */
  recipient?: string | bigint | number;
  /** Relayer address (0x0 for now) */
  relayer?: string | bigint | number;
  /** Optional progress callback */
  onProgress?: (stage: string, detail?: string) => void;
}

/**
 * Internal function to generate proof
 */
interface GetProofParams {
  inputs: Utxo[];
  outputs: Utxo[];
  tree: ReturnType<typeof buildMerkleTree> extends Promise<infer T> ? T : never;
  extAmount: bigint;
  fee: bigint;
  recipient: string | bigint;
  relayer: string | bigint;
  onProgress?: (stage: string, detail?: string) => void;
}

async function getProof({
  inputs,
  outputs,
  tree,
  extAmount,
  fee,
  recipient,
  relayer,
  onProgress,
}: GetProofParams): Promise<TransactionResult> {
  // Shuffle inputs and outputs for privacy
  inputs = shuffle([...inputs]);
  outputs = shuffle([...outputs]);

  onProgress?.('Building merkle paths...');
  
  const inputMerklePathIndices: number[] = [];
  const inputMerklePathElements: (bigint | number)[][] = [];

  // Get merkle path for each input
  for (const input of inputs) {
    if (input.amount > 0n) {
      const inputIndex = tree.indexOf(toFixedHex(input.getCommitment()));
      if (inputIndex < 0) {
        throw new Error(`Input commitment ${toFixedHex(input.getCommitment())} was not found in merkle tree`);
      }
      input.index = inputIndex;
      inputMerklePathIndices.push(inputIndex);
      inputMerklePathElements.push(
        tree.path(inputIndex).pathElements.map((el: string | number | bigint) => BigInt(el))
      );
    } else {
      // Empty input (padding) - use zero path
      inputMerklePathIndices.push(0);
      inputMerklePathElements.push(new Array(tree.levels).fill(0));
    }
  }

  onProgress?.('Encrypting outputs...');

  // Build external data
  const extData: ExtData = {
    recipient: toFixedHex(recipient, 20),
    extAmount: extAmount.toString(),
    relayer: toFixedHex(relayer, 20),
    fee: fee.toString(),
    encryptedOutput1: outputs[0].encrypt(),
    encryptedOutput2: outputs[1].encrypt(),
  };

  // Calculate extDataHash using raw values
  const extDataHashInput = {
    recipient: recipient,
    extAmount: extAmount,
    relayer: relayer,
    fee: fee,
    encryptedOutput1: extData.encryptedOutput1,
    encryptedOutput2: extData.encryptedOutput2,
  };
  const extDataHash = getExtDataHash(extDataHashInput);

  // Build proof input
  const proofInput: ProofInput = {
    root: BigInt(tree.root()),
    inputNullifier: inputs.map((x) => x.getNullifier()),
    outputCommitment: outputs.map((x) => x.getCommitment()),
    publicAmount: ((BigInt(extAmount) - BigInt(fee) + FIELD_SIZE) % FIELD_SIZE).toString(),
    extDataHash,

    // Input UTXO data
    inAmount: inputs.map((x) => x.amount),
    inPrivateKey: inputs.map((x) => x.keypair.privkey),
    inBlinding: inputs.map((x) => x.blinding),
    inPathIndices: inputMerklePathIndices,
    inPathElements: inputMerklePathElements,

    // Output UTXO data
    outAmount: outputs.map((x) => x.amount),
    outBlinding: outputs.map((x) => x.blinding),
    outPubkey: outputs.map((x) => x.keypair.pubkey),
  };

  onProgress?.('Generating ZK proof...', `${inputs.length} inputs`);

  // Select circuit based on input count and generate proof
  const circuitName = selectCircuit(inputs.length);
  const proof = await prove(proofInput, circuitName);

  // Build proof arguments for on-chain verification
  const args: ProofArgs = {
    proof,
    root: toFixedHex(proofInput.root),
    inputNullifiers: inputs.map((x) => toFixedHex(x.getNullifier())),
    outputCommitments: outputs.map((x) => toFixedHex(x.getCommitment())),
    publicAmount: toFixedHex(proofInput.publicAmount),
    extDataHash: toFixedHex(extDataHash),
  };

  onProgress?.('Proof generated successfully');

  return {
    args,
    extData,
  };
}

/**
 * Prepare a transaction (withdrawal or transfer)
 * Builds the ZK proof and external data needed for on-chain execution
 * 
 * @param params - Transaction parameters
 * @returns Proof arguments and external data
 * 
 * @example
 * ```typescript
 * // Withdrawal: send funds to external address
 * const result = await prepareTransaction({
 *   commitments: poolCommitments,
 *   inputs: [utxo1, utxo2],
 *   outputs: [changeUtxo], // Just change
 *   recipient: '0x1234...', // Withdrawal address
 *   fee: 0,
 *   relayer: '0x0000...',
 * });
 * 
 * // Transfer: move funds to another Veil user
 * const result = await prepareTransaction({
 *   commitments: poolCommitments,
 *   inputs: [utxo1],
 *   outputs: [recipientUtxo, changeUtxo],
 *   recipient: 0, // No external recipient
 *   fee: 0,
 *   relayer: '0x0000...',
 * });
 * ```
 */
export async function prepareTransaction({
  commitments,
  inputs = [],
  outputs = [],
  fee = 0,
  recipient = 0,
  relayer = 0,
  onProgress,
}: PrepareTransactionParams): Promise<TransactionResult> {
  // Validate input/output counts
  if (inputs.length > 16 || outputs.length > 2) {
    throw new Error('Incorrect inputs/outputs count. Maximum: 16 inputs, 2 outputs.');
  }

  // Pad inputs to 2 or 16 with empty UTXOs
  while (inputs.length !== 2 && inputs.length < 16) {
    inputs.push(new Utxo());
  }

  // Pad outputs to 2 with empty UTXOs
  while (outputs.length < 2) {
    outputs.push(new Utxo());
  }

  // Calculate external amount (fee + outputs - inputs)
  // Positive = withdrawal, Negative = deposit
  const extAmount = BigInt(fee) +
    outputs.reduce((sum, x) => sum + x.amount, 0n) -
    inputs.reduce((sum, x) => sum + x.amount, 0n);

  onProgress?.('Building merkle tree...');

  // Build merkle tree and generate proof
  const tree = await buildMerkleTree(commitments);

  const result = await getProof({
    inputs,
    outputs,
    tree,
    extAmount,
    fee: BigInt(fee),
    recipient: String(recipient),
    relayer: String(relayer),
    onProgress,
  });

  return result;
}
