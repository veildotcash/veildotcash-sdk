/**
 * Veil Keypair class
 * Generates and manages keypairs for Veil deposits
 */

import { ethers } from 'ethers';
import { poseidonHash, toFixedHex } from './utils.js';
import type { EncryptedMessage } from './types.js';

// eth-sig-util for x25519 encryption
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ethSigUtil = require('eth-sig-util');

/**
 * Pack encrypted message into hex string
 */
export function packEncryptedMessage(encryptedMessage: EncryptedMessage): string {
  const nonceBuf = Buffer.from(encryptedMessage.nonce, 'base64');
  const ephemPublicKeyBuf = Buffer.from(encryptedMessage.ephemPublicKey, 'base64');
  const ciphertextBuf = Buffer.from(encryptedMessage.ciphertext, 'base64');
  const messageBuff = Buffer.concat([
    Buffer.alloc(24 - nonceBuf.length),
    nonceBuf,
    Buffer.alloc(32 - ephemPublicKeyBuf.length),
    ephemPublicKeyBuf,
    ciphertextBuf,
  ]);
  return '0x' + messageBuff.toString('hex');
}

/**
 * Unpack hex string into encrypted message
 */
export function unpackEncryptedMessage(encryptedMessage: string): EncryptedMessage {
  if (encryptedMessage.slice(0, 2) === '0x') {
    encryptedMessage = encryptedMessage.slice(2);
  }
  const messageBuff = Buffer.from(encryptedMessage, 'hex');
  const nonceBuf = messageBuff.slice(0, 24);
  const ephemPublicKeyBuf = messageBuff.slice(24, 56);
  const ciphertextBuf = messageBuff.slice(56);
  return {
    version: 'x25519-xsalsa20-poly1305',
    nonce: nonceBuf.toString('base64'),
    ephemPublicKey: ephemPublicKeyBuf.toString('base64'),
    ciphertext: ciphertextBuf.toString('base64'),
  };
}

/**
 * Veil Keypair for deposits
 * 
 * A keypair consists of:
 * - Private key: Random 32-byte Ethereum-style key
 * - Public key: Poseidon hash of the private key
 * - Encryption key: x25519 public key for encrypted outputs
 * 
 * The deposit key (used for registration) is: pubkey + encryptionKey
 * 
 * @example
 * ```typescript
 * // Generate new keypair
 * const keypair = new Keypair();
 * console.log(keypair.depositKey()); // Register this on-chain
 * console.log(keypair.privkey);      // Store securely!
 * 
 * // Restore from existing private key
 * const restored = new Keypair(savedPrivkey);
 * ```
 */
export class Keypair {
  /** Private key (null if created from public deposit key only) */
  public privkey: string | null;
  
  /** Public key (Poseidon hash of private key) */
  public pubkey: bigint;
  
  /** x25519 encryption public key */
  public encryptionKey: string;

  /**
   * Create a new Keypair
   * @param privkey - Optional private key. If not provided, generates a random one.
   */
  constructor(privkey: string = ethers.Wallet.createRandom().privateKey) {
    this.privkey = privkey;
    this.pubkey = poseidonHash([this.privkey]);
    this.encryptionKey = ethSigUtil.getEncryptionPublicKey(privkey.slice(2));
  }

  /**
   * Get the deposit key for this keypair
   * This is what you register on-chain
   * @returns Deposit key as hex string (130 chars with 0x prefix)
   */
  toString(): string {
    return toFixedHex(this.pubkey) + Buffer.from(this.encryptionKey, 'base64').toString('hex');
  }

  /**
   * Alias for toString() - returns the deposit key
   * @returns Deposit key as hex string
   */
  depositKey(): string {
    return this.toString();
  }

  /**
   * Create a Keypair from a public deposit key (without private key)
   * Useful for sending transfers to other users
   * @param str - Deposit key (128 or 130 hex chars)
   * @returns Keypair instance (privkey will be null)
   */
  static fromString(str: string): Keypair {
    if (str.length === 130) {
      str = str.slice(2);
    }
    if (str.length !== 128) {
      throw new Error('Invalid deposit key length. Expected 128 hex chars (or 130 with 0x prefix)');
    }
    return Object.assign(new Keypair(), {
      privkey: null,
      pubkey: BigInt('0x' + str.slice(0, 64)),
      encryptionKey: Buffer.from(str.slice(64, 128), 'hex').toString('base64'),
    });
  }

  /**
   * Sign a message using the private key
   * @param commitment - Commitment hash
   * @param merklePath - Merkle path
   * @returns Signature as bigint
   */
  sign(commitment: string | number | bigint, merklePath: string | number | bigint): bigint {
    if (!this.privkey) {
      throw new Error('Cannot sign without private key');
    }
    return poseidonHash([this.privkey, commitment, merklePath]);
  }

  /**
   * Encrypt data using the encryption key
   * @param bytes - Data to encrypt
   * @returns Encrypted data as hex string
   */
  encrypt(bytes: Buffer): string {
    return packEncryptedMessage(
      ethSigUtil.encrypt(
        this.encryptionKey, 
        { data: bytes.toString('base64') }, 
        'x25519-xsalsa20-poly1305'
      )
    );
  }

  /**
   * Decrypt data using the private key
   * @param data - Encrypted data as hex string
   * @returns Decrypted data as Buffer
   */
  decrypt(data: string): Buffer {
    if (!this.privkey) {
      throw new Error('Cannot decrypt without private key');
    }
    return Buffer.from(
      ethSigUtil.decrypt(unpackEncryptedMessage(data), this.privkey.slice(2)), 
      'base64'
    );
  }
}
