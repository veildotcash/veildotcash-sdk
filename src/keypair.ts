/**
 * Veil Keypair class
 * Generates and manages keypairs for Veil deposits
 */

import { ethers } from 'ethers';
import { privateKeyToAccount } from 'viem/accounts';
import { poseidonHash, toFixedHex } from './utils.js';
import type { EncryptedMessage } from './types.js';

/**
 * Canonical message signed by a wallet to derive a Veil keypair.
 * Must match the frontend's SIGNED_MESSAGE in data/wallet/config.ts.
 */
export const VEIL_SIGNED_MESSAGE = "Sign this message to create your Veil Wallet private key. This will be used to decrypt your balances. Ensure you are signing this message on the Veil Cash website.";

/**
 * Any async function that performs EIP-191 personal_sign and returns a 0x-prefixed signature.
 * Used with Keypair.fromSigner() to support external signing services.
 */
export type MessageSigner = (message: string) => Promise<string>;

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
   * Derive a Keypair from an EIP-191 personal_sign signature.
   * The private key is keccak256(signature) -- matching the frontend derivation.
   * 
   * @param signature - Raw ECDSA signature (0x-prefixed, 132 hex chars)
   * @returns Keypair derived from the signature
   * 
   * @example
   * ```typescript
   * const keypair = Keypair.fromSignature(signature);
   * ```
   */
  static fromSignature(signature: string): Keypair {
    const privkey = ethers.keccak256(signature);
    return new Keypair(privkey);
  }

  /**
   * Derive a Keypair from an Ethereum wallet private key.
   * Signs VEIL_SIGNED_MESSAGE with the wallet, then derives via keccak256(signature).
   * Produces the same keypair as the frontend for the same wallet.
   * 
   * @param walletPrivateKey - Ethereum EOA private key (0x-prefixed)
   * @returns Promise resolving to the derived Keypair
   * 
   * @example
   * ```typescript
   * const keypair = await Keypair.fromWalletKey('0xYOUR_WALLET_PRIVATE_KEY');
   * console.log(keypair.depositKey()); // Same as frontend login with this wallet
   * ```
   */
  static async fromWalletKey(walletPrivateKey: `0x${string}`): Promise<Keypair> {
    const account = privateKeyToAccount(walletPrivateKey);
    const signature = await account.signMessage({ message: VEIL_SIGNED_MESSAGE });
    return Keypair.fromSignature(signature);
  }

  /**
   * Derive a Keypair using any external signer that supports personal_sign (EIP-191).
   * The signer function receives VEIL_SIGNED_MESSAGE and must return a 0x-prefixed signature.
   * Works with any signing backend: Bankr, MPC wallets, custodial services, hardware wallets, etc.
   * 
   * @param signer - Async function that signs a message and returns a 0x-prefixed signature
   * @returns Promise resolving to the derived Keypair
   * 
   * @example
   * ```typescript
   * // With Bankr
   * const keypair = await Keypair.fromSigner(async (message) => {
   *   const res = await fetch('https://api.bankr.bot/agent/sign', {
   *     method: 'POST',
   *     headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
   *     body: JSON.stringify({ signatureType: 'personal_sign', message }),
   *   });
   *   return (await res.json()).signature;
   * });
   * 
   * // With any custom signer
   * const keypair = await Keypair.fromSigner(async (msg) => myService.personalSign(msg));
   * ```
   */
  static async fromSigner(signer: MessageSigner): Promise<Keypair> {
    const signature = await signer(VEIL_SIGNED_MESSAGE);
    return Keypair.fromSignature(signature);
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
