/**
 * Merkle tree utilities for Veil SDK
 * Build merkle trees from UTXO commitments for ZK proofs
 */

// @ts-ignore - fixed-merkle-tree doesn't have TypeScript declarations
import MerkleTree from 'fixed-merkle-tree-legacy';
import { poseidonHash2, toFixedHex } from './utils.js';

/**
 * Height of the merkle tree (matches on-chain contract)
 */
export const MERKLE_TREE_HEIGHT = 23;

/**
 * Build a merkle tree from UTXO commitments
 * Uses Poseidon hash function compatible with on-chain verification
 * 
 * @param commitments - Array of commitment hashes (hex strings or bigints)
 * @returns MerkleTree instance
 * 
 * @example
 * ```typescript
 * const commitments = await poolContract.getCommitments(0, 1000);
 * const tree = await buildMerkleTree(commitments);
 * const root = tree.root();
 * ```
 */
export async function buildMerkleTree(commitments: (string | bigint)[]): Promise<MerkleTree> {
  // Convert commitments to fixed hex format
  const leaves = commitments.map((commitment) => toFixedHex(commitment));
  
  // Create hash function that uses Poseidon (matching on-chain)
  const hashFunction = (left: string | bigint, right: string | bigint): string => {
    const result = poseidonHash2(left, right);
    return result.toString();
  };
  
  const tree = new MerkleTree(MERKLE_TREE_HEIGHT, leaves, { hashFunction });
  
  return tree;
}

/**
 * Get merkle path for a commitment
 * 
 * @param tree - Merkle tree instance
 * @param commitment - Commitment to get path for
 * @returns Path elements and indices
 */
export function getMerklePath(tree: MerkleTree, commitment: bigint | string): {
  pathElements: bigint[];
  pathIndices: number;
} {
  const commitmentHex = toFixedHex(commitment);
  const index = tree.indexOf(commitmentHex);
  
  if (index < 0) {
    throw new Error(`Commitment ${commitmentHex} not found in merkle tree`);
  }
  
  const { pathElements } = tree.path(index);
  
  return {
    pathElements: pathElements.map((el: string | number | bigint) => BigInt(el)),
    pathIndices: index,
  };
}

// Re-export MerkleTree type for consumers
export type { MerkleTree };
