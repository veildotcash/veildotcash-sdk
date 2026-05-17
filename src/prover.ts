/**
 * ZK Proof generation for Veil SDK
 * Uses snarkjs groth16 to generate proofs for transactions
 */

import { groth16 } from 'snarkjs';
import { utils } from 'ffjavascript';
import { toFixedHex } from './utils.js';

// Type definition for ffjavascript utils
interface FFJavascriptUtils {
  stringifyBigInts: (obj: unknown) => unknown;
  unstringifyBigInts: (obj: unknown) => unknown;
}

const ffUtils = utils as FFJavascriptUtils;

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
 * Directory/base URL where proving keys are hosted, or a resolver that returns
 * the circuit base path without the `.wasm` / `.zkey` extension.
 */
export type ProvingKeyPath = string | ((circuitName: string) => string);

export interface ProveOptions {
  /**
   * Proving key location.
   *
   * In Node this defaults to the package/source `keys` directory. In browsers
   * this defaults to `/keys`, so apps can serve `/keys/transaction2.wasm` and
   * `/keys/transaction2.zkey` from their own origin.
   */
  provingKeyPath?: ProvingKeyPath;
  /** Force snarkjs single-threaded proving. Defaults to true. */
  singleThread?: boolean;
}

function isBrowserRuntime(): boolean {
  return !(typeof process !== 'undefined' && !!process.versions?.node);
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function normalizeCircuitBasePath(provingKeyPath: ProvingKeyPath, circuitName: string): string {
  const resolvedPath =
    typeof provingKeyPath === 'function' ? provingKeyPath(circuitName) : provingKeyPath;

  const withoutExtension = resolvedPath.replace(/\.(wasm|zkey)$/i, '');
  if (withoutExtension.endsWith(`/${circuitName}`) || withoutExtension.endsWith(`\\${circuitName}`)) {
    return withoutExtension;
  }

  return `${stripTrailingSlash(withoutExtension)}/${circuitName}`;
}

function importNodeModule<T>(specifier: string): Promise<T> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string
  ) => Promise<T>;
  return dynamicImport(specifier);
}

/**
 * Find the keys directory containing circuit files
 * Works in both development and installed package scenarios
 */
async function findNodeKeysDirectory(): Promise<string> {
  const [{ existsSync }, pathModule, { fileURLToPath }] = await Promise.all([
    importNodeModule<typeof import('node:fs')>('node:fs'),
    importNodeModule<typeof import('node:path')>('node:path'),
    importNodeModule<typeof import('node:url')>('node:url'),
  ]);
  const path = pathModule;

  // Try multiple possible locations
  const possiblePaths = [
    // When running from package (installed via npm)
    path.resolve(process.cwd(), 'node_modules', '@veil-cash', 'sdk', 'keys'),
    // When running from source
    path.resolve(process.cwd(), 'keys'),
  ];

  // Try to get module directory for ESM
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFilePath);
    possiblePaths.unshift(path.resolve(currentDir, '..', 'keys'));
  } catch {
    // Ignore non-file module URLs.
  }

  for (const p of possiblePaths) {
    if (existsSync(p) && existsSync(path.join(p, 'transaction2.wasm'))) {
      return p;
    }
  }

  throw new Error(
    'Circuit keys not found. Expected to find keys/ directory with transaction2.wasm and transaction2.zkey files.'
  );
}

async function resolveProvingKeyPaths(
  circuitName: string,
  provingKeyPath?: ProvingKeyPath,
): Promise<{ wasmPath: string; zkeyPath: string }> {
  if (provingKeyPath) {
    const circuitBasePath = normalizeCircuitBasePath(provingKeyPath, circuitName);
    return {
      wasmPath: `${circuitBasePath}.wasm`,
      zkeyPath: `${circuitBasePath}.zkey`,
    };
  }

  if (isBrowserRuntime()) {
    return {
      wasmPath: `/keys/${circuitName}.wasm`,
      zkeyPath: `/keys/${circuitName}.zkey`,
    };
  }

  const keysDir = await findNodeKeysDirectory();
  return {
    wasmPath: `${keysDir}/${circuitName}.wasm`,
    zkeyPath: `${keysDir}/${circuitName}.zkey`,
  };
}

async function assertNodeKeyFilesExist(wasmPath: string, zkeyPath: string): Promise<void> {
  if (isBrowserRuntime() || wasmPath.startsWith('http://') || wasmPath.startsWith('https://')) {
    return;
  }

  const { existsSync } = await importNodeModule<typeof import('node:fs')>('node:fs');
  if (!existsSync(wasmPath)) {
    throw new Error(`Circuit WASM file not found: ${wasmPath}`);
  }
  if (!existsSync(zkeyPath)) {
    throw new Error(`Circuit zkey file not found: ${zkeyPath}`);
  }
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
export async function prove(
  input: ProofInput,
  circuitName: string,
  options: ProveOptions = {},
): Promise<string> {
  const { wasmPath, zkeyPath } = await resolveProvingKeyPaths(circuitName, options.provingKeyPath);
  await assertNodeKeyFilesExist(wasmPath, zkeyPath);

  // Generate proof using snarkjs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await groth16.fullProve(
    ffUtils.stringifyBigInts(input) as any,
    wasmPath,
    zkeyPath,
    undefined,
    undefined,
    { singleThread: options.singleThread ?? true },
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
