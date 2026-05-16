/**
 * Crypto utilities for Veil SDK
 * Poseidon hash, hex conversion, and random number generation
 */

import * as circomlib from 'circomlib';
import { ethers } from 'ethers';

type Poseidon = (items: (bigint | string | number)[]) => { toString: () => string };

const poseidon = (
  'poseidon' in circomlib
    ? circomlib.poseidon
    : (circomlib as { default?: { poseidon?: Poseidon } }).default?.poseidon
) as Poseidon | undefined;

if (!poseidon) {
  throw new Error('circomlib poseidon export not found');
}

function getRandomBytes(nbytes: number): Uint8Array {
  const webCrypto = (globalThis as typeof globalThis & {
    crypto?: { getRandomValues<T extends Uint8Array>(array: T): T };
  }).crypto;

  if (webCrypto?.getRandomValues) {
    return webCrypto.getRandomValues(new Uint8Array(nbytes));
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto') as { randomBytes: (size: number) => Uint8Array };
    return nodeCrypto.randomBytes(nbytes);
  } catch {
    throw new Error('Secure random source unavailable');
  }
}

/**
 * SNARK scalar field size
 */
export const FIELD_SIZE = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617'
);

/**
 * Compute Poseidon hash of items
 * @param items - Array of values to hash (bigint, string, or number)
 * @returns Poseidon hash as bigint
 */
export const poseidonHash = (items: (bigint | string | number)[]): bigint => 
  BigInt(poseidon(items).toString());

/**
 * Compute Poseidon hash of two items
 * @param a - First value
 * @param b - Second value
 * @returns Poseidon hash as bigint
 */
export const poseidonHash2 = (a: bigint | string | number, b: bigint | string | number): bigint => 
  poseidonHash([a, b]);

/**
 * Generate random bigint of specified byte length
 * @param nbytes - Number of bytes (default: 31)
 * @returns Random bigint
 */
export const randomBN = (nbytes: number = 31): bigint => {
  const bytes = getRandomBytes(nbytes);
  let hex = '0x';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return BigInt(hex);
};

/**
 * Convert bigint/string/number/Buffer to fixed-length hex string
 * @param number - Value to convert
 * @param length - Output byte length (default: 32)
 * @returns Hex string with 0x prefix
 */
export function toFixedHex(number: bigint | string | number | Buffer, length: number = 32): string {
  let hexValue: string;
  
  if (typeof Buffer !== 'undefined' && number instanceof Buffer) {
    hexValue = number.toString('hex');
  } else {
    let bigIntValue = BigInt(number as bigint | string | number);
    
    if (bigIntValue < 0n) {
      // For negative numbers, use two's complement
      const maxValue = 1n << BigInt(length * 8);
      bigIntValue = maxValue + bigIntValue;
    }
    
    hexValue = bigIntValue.toString(16);
  }
  
  return '0x' + hexValue.padStart(length * 2, '0');
}

/**
 * Convert value to Buffer of specified byte length
 * @param value - Value to convert
 * @param length - Output byte length
 * @returns Buffer
 */
export const toBuffer = (value: bigint | string | number, length: number): Buffer => {
  const bigIntValue = BigInt(value);
  const hex = bigIntValue.toString(16).padStart(length * 2, '0');
  return Buffer.from(hex, 'hex');
};

/**
 * External data input for hash calculation
 */
export interface ExtDataInput {
  recipient: string | bigint;
  extAmount: bigint;
  relayer: string | bigint;
  fee: bigint;
  encryptedOutput1: string;
  encryptedOutput2: string;
}

/**
 * Calculate hash of external data for ZK proof
 * Uses Solidity-compatible ABI encoding and keccak256 hash
 * 
 * @param extData - External data to hash
 * @returns Hash as bigint (mod FIELD_SIZE)
 */
export function getExtDataHash(extData: ExtDataInput): bigint {
  const abi = ethers.AbiCoder.defaultAbiCoder();

  // Encode the struct exactly as Solidity would
  const encodedData = abi.encode(
    ['tuple(address,int256,address,uint256,bytes,bytes)'],
    [[
      extData.recipient,
      extData.extAmount,
      extData.relayer, 
      extData.fee,
      extData.encryptedOutput1,
      extData.encryptedOutput2,
    ]]
  );
  
  const hash = ethers.keccak256(encodedData);
  return BigInt(hash) % FIELD_SIZE;
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 * Used to randomize input/output order for privacy
 * 
 * @param array - Array to shuffle
 * @returns Shuffled array (mutates and returns same array)
 */
export function shuffle<T>(array: T[]): T[] {
  let currentIndex = array.length;
  let randomIndex: number;

  // While there remain elements to shuffle...
  while (currentIndex !== 0) {
    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }

  return array;
}
