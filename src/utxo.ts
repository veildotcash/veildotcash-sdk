/**
 * UTXO (Unspent Transaction Output) class for Veil SDK
 * Represents a private balance entry that can be spent
 */

import { Buffer } from 'buffer';
import { Keypair } from './keypair.js';
import { poseidonHash, toBuffer, randomBN } from './utils.js';

export interface UtxoParams {
  amount?: bigint | number | string;
  keypair?: Keypair;
  blinding?: bigint;
  index?: number;
}

/**
 * UTXO class - represents a private balance entry
 * 
 * A UTXO contains:
 * - amount: The value in wei
 * - blinding: Random value for privacy
 * - keypair: The owner's keypair
 * - index: Position in the merkle tree (needed for nullifier calculation)
 * 
 * @example
 * ```typescript
 * // Decrypt an encrypted output
 * const utxo = Utxo.decrypt(encryptedOutput, keypair);
 * utxo.index = 5; // Set the merkle tree index
 * 
 * // Check if spent
 * const nullifier = utxo.getNullifier();
 * const isSpent = await pool.isSpent(nullifier);
 * ```
 */
export class Utxo {
  public amount: bigint;
  public blinding: bigint;
  public keypair: Keypair;
  public index?: number;
  private _commitment?: bigint;
  private _nullifier?: bigint;

  /**
   * Create a new UTXO
   * @param params - UTXO parameters
   */
  constructor(params: UtxoParams = {}) {
    const { amount = 0, keypair = new Keypair(), blinding = randomBN(), index } = params;
    this.amount = BigInt(amount);
    this.blinding = BigInt(blinding);
    this.keypair = keypair;
    this.index = index;
  }

  /**
   * Get the commitment for this UTXO
   * commitment = poseidonHash([amount, pubkey, blinding])
   * @returns Commitment as bigint
   */
  getCommitment(): bigint {
    if (!this._commitment) {
      this._commitment = poseidonHash([this.amount, this.keypair.pubkey, this.blinding]);
    }
    return this._commitment;
  }

  /**
   * Get the nullifier for this UTXO
   * Requires index and private key to be set
   * nullifier = poseidonHash([commitment, index, signature])
   * @returns Nullifier as bigint
   */
  getNullifier(): bigint {
    if (!this._nullifier) {
      if (
        this.amount > 0n &&
        (this.index === undefined || !this.keypair.privkey)
      ) {
        throw new Error('Cannot compute nullifier without UTXO index or private key');
      }
      const signature = this.keypair.privkey 
        ? this.keypair.sign(this.getCommitment(), this.index || 0) 
        : 0n;
      this._nullifier = poseidonHash([this.getCommitment(), this.index || 0, signature]);
    }
    return this._nullifier;
  }

  /**
   * Encrypt UTXO data using the keypair
   * @returns Encrypted data as 0x-prefixed hex string
   */
  encrypt(): string {
    const bytes = Buffer.concat([
      toBuffer(this.amount, 31),
      toBuffer(this.blinding, 31),
    ]);
    return this.keypair.encrypt(bytes);
  }

  /**
   * Decrypt an encrypted output to create a UTXO
   * Only succeeds if the keypair owns this UTXO
   * 
   * @param data - Encrypted output as hex string
   * @param keypair - Keypair to decrypt with
   * @returns Decrypted UTXO
   * @throws If decryption fails (wrong keypair)
   */
  static decrypt(data: string, keypair: Keypair): Utxo {
    const buf = keypair.decrypt(data);
    return new Utxo({
      amount: BigInt('0x' + buf.slice(0, 31).toString('hex')),
      blinding: BigInt('0x' + buf.slice(31, 62).toString('hex')),
      keypair,
    });
  }
}
