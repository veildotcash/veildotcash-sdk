/**
 * ZK Proof generation for Veil SDK
 * Uses snarkjs groth16 to generate proofs for transactions
 */

import { groth16 } from 'snarkjs';
import { toFixedHex } from './utils.js';

function stringifyBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString(10);
  }
  if (Array.isArray(value)) {
    return value.map(stringifyBigInts);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = stringifyBigInts(item);
    }
    return result;
  }
  return value;
}

/**
 * Configured base path for circuit key files.
 * When set, prove() builds paths as `${basePath}/${circuitName}.wasm`
 * instead of searching the local filesystem.
 *
 * Browser integrators should call setKeyBasePath() at app init and
 * serve the key files as static assets (e.g. "/keys").
 */
let _keyBasePath: string | null = null;

/**
 * Configure where circuit key files are located.
 *
 * - Browser: set to a URL path like "/keys" (files served as static assets).
 *   snarkjs will fetch() them at proof time.
 * - Node.js: leave unset to auto-detect from the filesystem, or set an
 *   explicit absolute path to the directory containing the key files.
 *
 * @param basePath - URL path or filesystem directory (without trailing slash)
 *
 * @example
 * ```typescript
 * // Browser — serve keys as static assets
 * import { setKeyBasePath } from '@veil-cash/sdk';
 * setKeyBasePath('/keys');
 *
 * // Node.js — override auto-detection
 * setKeyBasePath('/opt/veil/circuit-keys');
 * ```
 */
export function setKeyBasePath(basePath: string): void {
  _keyBasePath = basePath.replace(/\/+$/, '');
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
 * Find the keys directory containing circuit files.
 * Only called in Node.js when no keyBasePath is configured.
 */
function findKeysDirectory(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');

  const possiblePaths = [
    path.resolve(process.cwd(), 'keys'),
  ];

  if (typeof __dirname !== 'undefined') {
    possiblePaths.unshift(
      path.resolve(__dirname, '..', 'keys'),
      path.resolve(__dirname, '..', '..', 'keys'),
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fileURLToPath } = require('url') as typeof import('url');
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
    'Circuit keys not found. Expected to find keys/ directory with transaction2.wasm and transaction2.zkey files. ' +
    'In a browser environment, call setKeyBasePath() before generating proofs.'
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
  let wasmPath: string;
  let zkeyPath: string;

  if (_keyBasePath !== null) {
    wasmPath = `${_keyBasePath}/${circuitName}.wasm`;
    zkeyPath = `${_keyBasePath}/${circuitName}.zkey`;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');

    const keysDir = findKeysDirectory();
    wasmPath = path.join(keysDir, `${circuitName}.wasm`);
    zkeyPath = path.join(keysDir, `${circuitName}.zkey`);

    if (!fs.existsSync(wasmPath)) {
      throw new Error(`Circuit WASM file not found: ${wasmPath}`);
    }
    if (!fs.existsSync(zkeyPath)) {
      throw new Error(`Circuit zkey file not found: ${zkeyPath}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await groth16.fullProve(
    stringifyBigInts(input) as any,
    wasmPath,
    zkeyPath,
    undefined,
    undefined,
    { singleThread: true },
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
