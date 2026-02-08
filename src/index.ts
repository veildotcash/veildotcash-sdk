/**
 * Veil Cash SDK
 * 
 * SDK for interacting with Veil Cash privacy pools.
 * Generate keypairs, register, deposit, withdraw, and transfer privately.
 * 
 * @example
 * ```typescript
 * import { Keypair, withdraw, transfer, buildWithdrawProof } from '@veil-cash/sdk';
 * 
 * // Generate keypair
 * const keypair = new Keypair();
 * console.log(keypair.depositKey()); // Register this
 * console.log(keypair.privkey);      // Save securely!
 * 
 * // Withdraw from pool
 * const result = await withdraw({
 *   amount: '0.1',
 *   recipient: '0x1234...',
 *   keypair,
 * });
 * 
 * // Transfer privately
 * const transfer = await transfer({
 *   amount: '0.1',
 *   recipientAddress: '0x5678...',
 *   senderKeypair: keypair,
 * });
 * ```
 * 
 * @packageDocumentation
 */

// Keypair
export { Keypair, packEncryptedMessage, unpackEncryptedMessage } from './keypair.js';

// UTXO
export { Utxo } from './utxo.js';
export type { UtxoParams } from './utxo.js';

// Deposit functions
export { 
  buildRegisterTx,
  buildDepositETHTx,
  buildDepositUSDCTx,
  buildApproveUSDCTx,
  buildDepositBTCTx,
  buildApproveBTCTx,
  buildDepositTx,
} from './deposit.js';

// Balance functions
export {
  getQueueBalance,
  getPrivateBalance,
} from './balance.js';
export type { ProgressCallback } from './balance.js';

// Withdraw functions
export {
  withdraw,
  buildWithdrawProof,
  selectUtxosForWithdraw,
} from './withdraw.js';

// Transfer functions
export {
  transfer,
  buildTransferProof,
  checkRecipientRegistration,
  mergeUtxos,
} from './transfer.js';

// Transaction preparation (core ZK proof building)
export {
  prepareTransaction,
} from './transaction.js';
export type {
  ExtData,
  ProofArgs,
  TransactionResult,
  PrepareTransactionParams,
} from './transaction.js';

// Merkle tree utilities
export {
  buildMerkleTree,
  getMerklePath,
  MERKLE_TREE_HEIGHT,
} from './merkle.js';

// ZK Prover
export {
  prove,
  selectCircuit,
  CIRCUIT_CONFIG,
} from './prover.js';
export type { ProofInput } from './prover.js';

// Addresses and config
export { 
  ADDRESSES, 
  POOL_CONFIG, 
  getAddresses,
  getPoolAddress,
  getQueueAddress,
  getRelayUrl,
} from './addresses.js';

// Relay functions
export {
  submitRelay,
  checkRelayHealth,
  getRelayInfo,
  RelayError,
} from './relay.js';

// ABIs
export { ENTRY_ABI, ERC20_ABI, QUEUE_ABI, POOL_ABI } from './abi.js';

// Utilities
export { 
  poseidonHash, 
  poseidonHash2, 
  toFixedHex, 
  toBuffer,
  randomBN,
  getExtDataHash,
  shuffle,
  FIELD_SIZE,
} from './utils.js';
export type { ExtDataInput } from './utils.js';

// Types
export type {
  Token,
  EncryptedMessage,
  NetworkAddresses,
  RegisterTxOptions,
  DepositTxOptions,
  TransactionData,
  PoolConfig,
  PendingDeposit,
  QueueBalanceResult,
  UtxoInfo,
  PrivateBalanceResult,
  // Relay types
  RelayPool,
  RelayType,
  RelayProofArgs,
  RelayExtData,
  RelayMetadata,
  RelayRequest,
  RelayResponse,
  RelayErrorResponse,
  SubmitRelayOptions,
  // Withdraw/Transfer types
  BuildWithdrawProofOptions,
  BuildTransferProofOptions,
  ProofBuildResult,
  WithdrawResult,
  TransferResult,
  UtxoSelectionResult,
} from './types.js';
