/**
 * ZK Proof generation for Veil SDK
 * Uses snarkjs groth16 to generate proofs for transactions
 */

import { groth16 } from 'snarkjs';
import { toFixedHex } from './utils.js';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// Type definition for ffjavascript utils
interface FFJavascriptUtils {
  stringifyBigInts: (obj: unknown) => unknown;
  unstringifyBigInts: (obj: unknown) => unknown;
}

// Dynamic import for ffjavascript
let utils: FFJavascriptUtils | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffjavascript = require('ffjavascript');
  utils = ffjavascript.utils;
} catch {
  console.warn('ffjavascript not found. Proof generation may not work.');
}

/**
 * Input data for ZK proof generation
 */
export interface ProofInput {
  root: bigint;
  inputNullifier: bigint[];
  outputCommitment: bigint[];
  publicAmount: string;
  extDataHash: bigint;
  
  // Input UTXO data
  inAmount: bigint[];
  inPrivateKey: (string | null)[];
  inBlinding: bigint[];
  inPathIndices: number[];
  inPathElements: (bigint | number)[][];
  
  // Output UTXO data
  outAmount: bigint[];
  outBlinding: bigint[];
  outPubkey: bigint[];
}

/**
 * Raw snarkjs proof structure
 */
interface SnarkProof {
  pi_a: [string, string];
  pi_b: [[string, string], [string, string]];
  pi_c: [string, string];
}

interface ProveResult {
  proof: SnarkProof;
  publicSignals: string[];
}

/**
 * Find the keys directory containing circuit files
 * Works in both development and installed package scenarios
 */
function findKeysDirectory(): string {
  // Try multiple possible locations
  const possiblePaths = [
    // When running from package (installed via npm)
    path.resolve(__dirname, '..', 'keys'),
    path.resolve(__dirname, '..', '..', 'keys'),
    // When running from source
    path.resolve(process.cwd(), 'keys'),
    // ESM module path
  ];

  // Try to get module directory for ESM
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFilePath);
    possiblePaths.unshift(path.resolve(currentDir, '..', 'keys'));
  } catch {
    // Not ESM environment, use __dirname
  }

  for (const p of possiblePaths) {
    if (fs.existsSync(p) && fs.existsSync(path.join(p, 'transaction2.wasm'))) {
      return p;
    }
  }

  throw new Error(
    'Circuit keys not found. Expected to find keys/ directory with transaction2.wasm and transaction2.zkey files.'
  );
}

/**
 * Generate a ZK proof for a transaction
 * 
 * @param input - Proof input data
 * @param circuitName - Circuit name (e.g., 'transaction2' or 'transaction16')
 * @returns Serialized proof as hex string
 * 
 * @example
 * ```typescript
 * const proof = await prove(proofInput, 'transaction2');
 * // Returns: 0x1234...abcd (256 bytes hex)
 * ```
 */
export async function prove(input: ProofInput, circuitName: string): Promise<string> {
  if (!utils) {
    throw new Error('ffjavascript is required for proof generation. Please install it: npm install ffjavascript');
  }

  const keysDir = findKeysDirectory();
  const wasmPath = path.join(keysDir, `${circuitName}.wasm`);
  const zkeyPath = path.join(keysDir, `${circuitName}.zkey`);

  // Verify files exist
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`Circuit WASM file not found: ${wasmPath}`);
  }
  if (!fs.existsSync(zkeyPath)) {
    throw new Error(`Circuit zkey file not found: ${zkeyPath}`);
  }

  // Generate proof using snarkjs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await groth16.fullProve(
    utils.stringifyBigInts(input) as any,
    wasmPath,
    zkeyPath,
  );
  const proof = result.proof as unknown as SnarkProof;

  // Serialize proof to hex string format expected by on-chain verifier
  // Format: pi_a[0] + pi_a[1] + pi_b[0][1] + pi_b[0][0] + pi_b[1][1] + pi_b[1][0] + pi_c[0] + pi_c[1]
  return (
    '0x' +
    toFixedHex(proof.pi_a[0]).slice(2) +
    toFixedHex(proof.pi_a[1]).slice(2) +
    toFixedHex(proof.pi_b[0][1]).slice(2) +
    toFixedHex(proof.pi_b[0][0]).slice(2) +
    toFixedHex(proof.pi_b[1][1]).slice(2) +
    toFixedHex(proof.pi_b[1][0]).slice(2) +
    toFixedHex(proof.pi_c[0]).slice(2) +
    toFixedHex(proof.pi_c[1]).slice(2)
  );
}

/**
 * Get the supported circuit names and their max input counts
 */
export const CIRCUIT_CONFIG = {
  transaction2: { maxInputs: 2, maxOutputs: 2 },
  transaction16: { maxInputs: 16, maxOutputs: 2 },
} as const;

/**
 * Select the appropriate circuit based on input count
 * 
 * @param inputCount - Number of input UTXOs
 * @returns Circuit name to use
 */
export function selectCircuit(inputCount: number): string {
  if (inputCount <= 2) {
    return 'transaction2';
  } else if (inputCount <= 16) {
    return 'transaction16';
  } else {
    throw new Error(`Too many inputs: ${inputCount}. Maximum supported is 16.`);
  }
}
