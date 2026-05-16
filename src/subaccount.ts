import {
  createPublicClient,
  encodeFunctionData,
  encodePacked,
  formatEther,
  formatUnits,
  http,
  isAddress,
  keccak256,
  parseEther,
  parseUnits,
} from 'viem';
import { privateKeyToAccount, privateKeyToAddress } from 'viem/accounts';
import { base } from 'viem/chains';
import { FORWARDER_ABI, FORWARDER_FACTORY_ABI, ERC20_ABI, POOL_ABI } from './abi.js';
import { FORWARDER_CONTRACT_VERSION, getAddresses, getForwarderFactoryAddress, getPoolAddress, POOL_CONFIG } from './addresses.js';
import { getPrivateBalance, getQueueBalance } from './balance.js';
import { Keypair } from './keypair.js';
import { postRelayJson, submitRelay } from './relay.js';
import { prepareTransaction } from './transaction.js';
import { Utxo } from './utxo.js';
import { selectUtxosForWithdraw } from './withdraw.js';
import type {
  SubaccountAsset,
  SubaccountDeployRequest,
  SubaccountMergeOptions,
  SubaccountMergeResult,
  PrivateBalanceResult,
  SubaccountPrivateBalanceStatus,
  SubaccountQueueStatus,
  SubaccountRecoveryResult,
  SubaccountRelayResult,
  SubaccountSlot,
  SubaccountStatusResult,
  SubaccountSweepRequest,
  SubaccountWithdrawTypedData,
} from './types.js';

const SUBACCOUNT_CHILD_DOMAIN = 'veil-sua-child';
const SUBACCOUNT_SALT_DOMAIN = 'veil-sua-salt';
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const DEFAULT_WITHDRAW_DEADLINE_SECONDS = 3600n;
const DEFAULT_MAX_NONCE_SCAN = 100n;
export const MAX_SUBACCOUNT_SLOTS = 3;

function createBaseClient(rpcUrl?: string) {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });
}

function assertPrivateKey(value: string, label: string): asserts value is `0x${string}` {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a 0x-prefixed 32-byte hex string`);
  }
}

function normalizeSlot(slot: number): number {
  if (!Number.isInteger(slot) || slot < 0) {
    throw new Error('slot must be a non-negative integer');
  }
  if (slot >= MAX_SUBACCOUNT_SLOTS) {
    throw new Error(`slot must be less than ${MAX_SUBACCOUNT_SLOTS} (supported slots: 0-${MAX_SUBACCOUNT_SLOTS - 1})`);
  }
  return slot;
}

function normalizeAsset(asset: string): SubaccountAsset {
  if (asset !== 'eth' && asset !== 'usdc') {
    throw new Error('asset must be "eth" or "usdc"');
  }
  return asset;
}

function normalizeNonce(value: bigint | number): bigint {
  const nonce = typeof value === 'bigint' ? value : BigInt(value);
  if (nonce < 0n) {
    throw new Error('nonce must be non-negative');
  }
  return nonce;
}

function normalizeDeadline(deadline?: bigint | number): bigint {
  const nextDeadline =
    deadline === undefined
      ? BigInt(Math.floor(Date.now() / 1000)) + DEFAULT_WITHDRAW_DEADLINE_SECONDS
      : typeof deadline === 'bigint'
        ? deadline
        : BigInt(deadline);

  if (nextDeadline <= 0n) {
    throw new Error('deadline must be greater than 0');
  }

  return nextDeadline;
}

export function deriveSubaccountChildPrivateKey(
  rootPrivateKey: string,
  slot: number,
): `0x${string}` {
  assertPrivateKey(rootPrivateKey, 'rootPrivateKey');
  const normalizedSlot = normalizeSlot(slot);
  return keccak256(
    encodePacked(
      ['bytes32', 'string', 'uint256'],
      [rootPrivateKey, SUBACCOUNT_CHILD_DOMAIN, BigInt(normalizedSlot)],
    ),
  );
}

export function deriveSubaccountSalt(
  rootPrivateKey: string,
  slot: number,
): `0x${string}` {
  assertPrivateKey(rootPrivateKey, 'rootPrivateKey');
  const normalizedSlot = normalizeSlot(slot);
  return keccak256(
    encodePacked(
      ['bytes32', 'string', 'uint256'],
      [rootPrivateKey, SUBACCOUNT_SALT_DOMAIN, BigInt(normalizedSlot)],
    ),
  );
}

export function deriveSubaccountChildOwner(childPrivateKey: string): `0x${string}` {
  assertPrivateKey(childPrivateKey, 'childPrivateKey');
  return privateKeyToAddress(childPrivateKey);
}

export function deriveSubaccountChildDepositKey(childPrivateKey: string): string {
  assertPrivateKey(childPrivateKey, 'childPrivateKey');
  return new Keypair(childPrivateKey).depositKey();
}

export async function predictSubaccountForwarder(options: {
  salt: `0x${string}`;
  childDepositKey: string;
  childOwner: `0x${string}`;
  rpcUrl?: string;
}): Promise<`0x${string}`> {
  const publicClient = createBaseClient(options.rpcUrl);
  const depositKeyBytes = options.childDepositKey.startsWith('0x')
    ? options.childDepositKey
    : `0x${options.childDepositKey}`;
  return publicClient.readContract({
    abi: FORWARDER_FACTORY_ABI,
    address: getForwarderFactoryAddress(),
    functionName: 'computeAddress',
    args: [options.salt, depositKeyBytes as `0x${string}`, options.childOwner],
  }) as Promise<`0x${string}`>;
}

export async function deriveSubaccountSlot(options: {
  rootPrivateKey: `0x${string}`;
  slot: number;
  rpcUrl?: string;
}): Promise<SubaccountSlot> {
  const normalizedSlot = normalizeSlot(options.slot);
  const childPrivateKey = deriveSubaccountChildPrivateKey(options.rootPrivateKey, normalizedSlot);
  const salt = deriveSubaccountSalt(options.rootPrivateKey, normalizedSlot);
  const childOwner = deriveSubaccountChildOwner(childPrivateKey);
  const childDepositKey = deriveSubaccountChildDepositKey(childPrivateKey);
  const forwarderAddress = await predictSubaccountForwarder({
    salt,
    childDepositKey,
    childOwner,
    rpcUrl: options.rpcUrl,
  });

  return {
    slot: normalizedSlot,
    childOwner,
    childDepositKey,
    salt,
    forwarderAddress,
  };
}

export async function isSubaccountForwarderDeployed(options: {
  forwarderAddress: `0x${string}`;
  rpcUrl?: string;
}): Promise<boolean> {
  if (!isAddress(options.forwarderAddress)) {
    throw new Error('forwarderAddress must be a valid Ethereum address');
  }

  const publicClient = createBaseClient(options.rpcUrl);
  const code = await publicClient.getCode({ address: options.forwarderAddress });
  return !!code && code !== '0x';
}

export async function deploySubaccountForwarder(
  options: SubaccountDeployRequest,
): Promise<SubaccountRelayResult & { slot: SubaccountSlot }> {
  const slot = await deriveSubaccountSlot({
    rootPrivateKey: options.rootPrivateKey,
    slot: options.slot,
    rpcUrl: options.rpcUrl,
  });

  const result = await postRelayJson<SubaccountRelayResult>(
    '/stealth/deploy',
    {
      salt: slot.salt,
      childDepositKey: slot.childDepositKey,
      childOwner: slot.childOwner,
      expectedForwarder: slot.forwarderAddress,
    },
    options.relayUrl,
  );

  return { ...result, slot };
}

export async function sweepSubaccountForwarder(
  options: SubaccountSweepRequest,
): Promise<SubaccountRelayResult> {
  const asset = normalizeAsset(options.asset);
  if (!isAddress(options.forwarderAddress)) {
    throw new Error('forwarderAddress must be a valid Ethereum address');
  }

  return postRelayJson<SubaccountRelayResult>(
    '/stealth/sweep',
    {
      forwarder: options.forwarderAddress,
      asset,
    },
    options.relayUrl,
  );
}

function toQueueStatus(
  asset: SubaccountAsset,
  result: Awaited<ReturnType<typeof getQueueBalance>>,
): SubaccountQueueStatus {
  return {
    asset,
    queueBalance: result.queueBalance,
    queueBalanceWei: result.queueBalanceWei,
    pendingCount: result.pendingCount,
    pendingDeposits: result.pendingDeposits,
  };
}

function toPrivateBalanceStatus(result: PrivateBalanceResult): SubaccountPrivateBalanceStatus {
  return {
    privateBalance: result.privateBalance,
    privateBalanceWei: result.privateBalanceWei,
    utxoCount: result.utxoCount,
    spentCount: result.spentCount,
    unspentCount: result.unspentCount,
  };
}

export async function getSubaccountPrivateBalance(options: {
  rootPrivateKey: `0x${string}`;
  slot: number;
  pool?: 'eth' | 'usdc';
  rpcUrl?: string;
  onProgress?: (stage: string, detail?: string) => void;
}): Promise<PrivateBalanceResult> {
  const normalizedSlot = normalizeSlot(options.slot);
  assertPrivateKey(options.rootPrivateKey, 'rootPrivateKey');

  const childPrivateKey = deriveSubaccountChildPrivateKey(options.rootPrivateKey, normalizedSlot);
  const childKeypair = new Keypair(childPrivateKey);

  return getPrivateBalance({
    keypair: childKeypair,
    pool: options.pool,
    rpcUrl: options.rpcUrl,
    onProgress: options.onProgress,
  });
}

export async function getSubaccountStatus(options: {
  rootPrivateKey: `0x${string}`;
  slot: number;
  rpcUrl?: string;
}): Promise<SubaccountStatusResult> {
  const slot = await deriveSubaccountSlot(options);
  const publicClient = createBaseClient(options.rpcUrl);
  const addresses = getAddresses();

  const [deployed, ethWei, usdcWei, ethQueue, usdcQueue, ethPrivate, usdcPrivate] = await Promise.all([
    isSubaccountForwarderDeployed({
      forwarderAddress: slot.forwarderAddress,
      rpcUrl: options.rpcUrl,
    }),
    publicClient.getBalance({ address: slot.forwarderAddress }),
    publicClient.readContract({
      address: addresses.usdcToken,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [slot.forwarderAddress],
    }) as Promise<bigint>,
    getQueueBalance({
      address: slot.forwarderAddress,
      pool: 'eth',
      rpcUrl: options.rpcUrl,
    }),
    getQueueBalance({
      address: slot.forwarderAddress,
      pool: 'usdc',
      rpcUrl: options.rpcUrl,
    }),
    getSubaccountPrivateBalance({
      rootPrivateKey: options.rootPrivateKey,
      slot: options.slot,
      pool: 'eth',
      rpcUrl: options.rpcUrl,
    }),
    getSubaccountPrivateBalance({
      rootPrivateKey: options.rootPrivateKey,
      slot: options.slot,
      pool: 'usdc',
      rpcUrl: options.rpcUrl,
    }),
  ]);

  return {
    slot,
    deployed,
    balances: {
      eth: {
        balance: formatEther(ethWei),
        balanceWei: ethWei.toString(),
      },
      usdc: {
        balance: formatUnits(usdcWei, 6),
        balanceWei: usdcWei.toString(),
      },
    },
    privateBalances: {
      eth: toPrivateBalanceStatus(ethPrivate),
      usdc: toPrivateBalanceStatus(usdcPrivate),
    },
    queues: {
      eth: toQueueStatus('eth', ethQueue),
      usdc: toQueueStatus('usdc', usdcQueue),
    },
  };
}

const WITHDRAW_TYPES: SubaccountWithdrawTypedData['types'] = {
  Withdraw: [
    { name: 'token', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

export function buildSubaccountWithdrawTypedData(options: {
  forwarderAddress: `0x${string}`;
  token: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
}): SubaccountWithdrawTypedData {
  if (!isAddress(options.forwarderAddress)) {
    throw new Error('forwarderAddress must be a valid Ethereum address');
  }
  if (!isAddress(options.token)) {
    throw new Error('token must be a valid Ethereum address');
  }
  if (!isAddress(options.to)) {
    throw new Error('to must be a valid Ethereum address');
  }

  return {
    domain: {
      name: 'VeilForwarder',
      version: FORWARDER_CONTRACT_VERSION,
      chainId: getAddresses().chainId,
      verifyingContract: options.forwarderAddress,
    },
    types: WITHDRAW_TYPES,
    primaryType: 'Withdraw',
    message: {
      token: options.token,
      to: options.to,
      amount: options.amount,
      nonce: options.nonce,
      deadline: options.deadline,
    },
  };
}

export async function signSubaccountWithdraw(options: {
  childPrivateKey: `0x${string}`;
  typedData: SubaccountWithdrawTypedData;
}): Promise<`0x${string}`> {
  assertPrivateKey(options.childPrivateKey, 'childPrivateKey');
  const account = privateKeyToAccount(options.childPrivateKey);
  return account.signTypedData({
    domain: options.typedData.domain,
    types: options.typedData.types,
    primaryType: options.typedData.primaryType,
    message: options.typedData.message,
  });
}

export async function isSubaccountWithdrawNonceUsed(options: {
  forwarderAddress: `0x${string}`;
  nonce: bigint | number;
  rpcUrl?: string;
}): Promise<boolean> {
  if (!isAddress(options.forwarderAddress)) {
    throw new Error('forwarderAddress must be a valid Ethereum address');
  }

  const publicClient = createBaseClient(options.rpcUrl);
  try {
    return await publicClient.readContract({
      abi: FORWARDER_ABI,
      address: options.forwarderAddress,
      functionName: 'usedNonces',
      args: [normalizeNonce(options.nonce)],
    }) as boolean;
  } catch (error) {
    if (String(error).includes('returned no data')) {
      throw new Error('Subaccount forwarder is not deployed');
    }
    throw error;
  }
}

export async function findNextSubaccountWithdrawNonce(options: {
  forwarderAddress: `0x${string}`;
  startNonce?: bigint | number;
  maxScan?: bigint | number;
  rpcUrl?: string;
}): Promise<bigint> {
  const startNonce = normalizeNonce(options.startNonce ?? 0n);
  const maxScan = normalizeNonce(options.maxScan ?? DEFAULT_MAX_NONCE_SCAN);
  const limit = startNonce + maxScan;
  let nonce = startNonce;

  while (
    await isSubaccountWithdrawNonceUsed({
      forwarderAddress: options.forwarderAddress,
      nonce,
      rpcUrl: options.rpcUrl,
    })
  ) {
    nonce += 1n;
    if (nonce > limit) {
      throw new Error('Unable to find an unused withdraw nonce within the scan limit');
    }
  }

  return nonce;
}

export async function buildSubaccountRecoveryTx(options: {
  rootPrivateKey: `0x${string}`;
  slot: number;
  asset: SubaccountAsset;
  to: `0x${string}`;
  amount: string;
  nonce?: bigint | number;
  deadline?: bigint | number;
  rpcUrl?: string;
}): Promise<SubaccountRecoveryResult> {
  if (!isAddress(options.to)) {
    throw new Error('to must be a valid Ethereum address');
  }

  const asset = normalizeAsset(options.asset);
  const slot = await deriveSubaccountSlot({
    rootPrivateKey: options.rootPrivateKey,
    slot: options.slot,
    rpcUrl: options.rpcUrl,
  });
  const deployed = await isSubaccountForwarderDeployed({
    forwarderAddress: slot.forwarderAddress,
    rpcUrl: options.rpcUrl,
  });
  if (!deployed) {
    throw new Error('Subaccount forwarder is not deployed');
  }
  const childPrivateKey = deriveSubaccountChildPrivateKey(options.rootPrivateKey, options.slot);
  const tokenAddress =
    asset === 'eth' ? ETH_ADDRESS : getAddresses().usdcToken;
  const amountWei =
    asset === 'eth'
      ? parseEther(options.amount)
      : parseUnits(options.amount, 6);
  const nonce =
    options.nonce === undefined
      ? await findNextSubaccountWithdrawNonce({
          forwarderAddress: slot.forwarderAddress,
          rpcUrl: options.rpcUrl,
        })
      : normalizeNonce(options.nonce);
  const deadline = normalizeDeadline(options.deadline);
  const typedData = buildSubaccountWithdrawTypedData({
    forwarderAddress: slot.forwarderAddress,
    token: tokenAddress,
    to: options.to,
    amount: amountWei,
    nonce,
    deadline,
  });
  const signature = await signSubaccountWithdraw({
    childPrivateKey,
    typedData,
  });

  return {
    transaction: {
      to: slot.forwarderAddress,
      data: encodeFunctionData({
        abi: FORWARDER_ABI,
        functionName: 'withdraw',
        args: [tokenAddress, options.to, amountWei, nonce, deadline, signature],
      }),
    },
    forwarderAddress: slot.forwarderAddress,
    asset,
    amount: options.amount,
    amountWei: amountWei.toString(),
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    recipient: options.to,
    tokenAddress,
    signature,
  };
}

/**
 * Merge a subaccount's entire private balance back to the main wallet.
 *
 * Builds a ZK transfer proof that moves every unspent UTXO belonging to the
 * child keypair into a new UTXO encrypted to the parent (root) keypair,
 * then submits it via the relay.
 *
 * @param options - Merge options
 * @returns Merge result with transaction hash and amount
 *
 * @example
 * ```typescript
 * const result = await mergeSubaccount({
 *   rootPrivateKey: process.env.VEIL_KEY as `0x${string}`,
 *   slot: 0,
 *   pool: 'eth',
 * });
 * console.log(`Merged ${result.amount} — tx: ${result.transactionHash}`);
 * ```
 */
export async function mergeSubaccount(
  options: SubaccountMergeOptions,
): Promise<SubaccountMergeResult> {
  const {
    rootPrivateKey,
    slot,
    pool = 'eth',
    rpcUrl,
    relayUrl,
    provingKeyPath,
    onProgress,
  } = options;

  const normalizedSlot = normalizeSlot(slot);
  assertPrivateKey(rootPrivateKey, 'rootPrivateKey');

  const poolConfig = POOL_CONFIG[pool];
  const poolAddress = getPoolAddress(pool);

  // Derive child and parent keypairs
  const childPrivateKey = deriveSubaccountChildPrivateKey(rootPrivateKey, normalizedSlot);
  const childKeypair = new Keypair(childPrivateKey);
  const parentKeypair = new Keypair(rootPrivateKey);

  // Fetch child's private balance
  onProgress?.('Fetching subaccount balance...');
  const balanceResult = await getPrivateBalance({
    keypair: childKeypair,
    pool,
    rpcUrl,
    onProgress,
  });

  const unspentUtxoInfos = balanceResult.utxos.filter(u => !u.isSpent);
  if (unspentUtxoInfos.length === 0) {
    throw new Error('Subaccount has no unspent UTXOs to merge');
  }
  if (unspentUtxoInfos.length > 16) {
    throw new Error(
      `Subaccount has ${unspentUtxoInfos.length} unspent UTXOs which exceeds the 16-input circuit limit. ` +
      'Consolidate UTXOs on the subaccount first before merging.',
    );
  }

  // Re-decrypt UTXOs to get full Utxo objects
  onProgress?.('Preparing UTXOs...');
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  const utxos: Utxo[] = [];
  for (const utxoInfo of unspentUtxoInfos) {
    const encryptedOutputs = await publicClient.readContract({
      address: poolAddress,
      abi: POOL_ABI,
      functionName: 'getEncryptedOutputs',
      args: [BigInt(utxoInfo.index), BigInt(utxoInfo.index + 1)],
    }) as string[];

    if (encryptedOutputs.length > 0) {
      try {
        const utxo = Utxo.decrypt(encryptedOutputs[0], childKeypair);
        utxo.index = utxoInfo.index;
        utxos.push(utxo);
      } catch {
        // Skip if decryption fails
      }
    }
  }

  if (utxos.length === 0) {
    throw new Error('Failed to decrypt subaccount UTXOs');
  }

  // Select all UTXOs — transfer the full balance
  onProgress?.('Selecting UTXOs...');
  const amount = balanceResult.privateBalance;
  const { selectedUtxos, changeAmount } = selectUtxosForWithdraw(
    utxos,
    amount,
    poolConfig.decimals,
  );

  // Create output UTXO encrypted to the parent keypair
  const outputs: Utxo[] = [];
  const mergeWei = parseUnits(amount, poolConfig.decimals);

  outputs.push(new Utxo({ amount: mergeWei, keypair: parentKeypair }));

  if (changeAmount > 0n) {
    outputs.push(new Utxo({ amount: changeAmount, keypair: parentKeypair }));
  }

  // Fetch all commitments from pool
  onProgress?.('Fetching commitments...');
  const nextIndex = await publicClient.readContract({
    address: poolAddress,
    abi: POOL_ABI,
    functionName: 'nextIndex',
  }) as number;

  const BATCH_SIZE = 5000;
  const commitments: string[] = [];
  const totalBatches = Math.ceil(nextIndex / BATCH_SIZE);

  for (let start = 0; start < nextIndex; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, nextIndex);
    const batchNum = Math.floor(start / BATCH_SIZE) + 1;
    onProgress?.('Fetching commitments', `batch ${batchNum}/${totalBatches}`);

    const batch = await publicClient.readContract({
      address: poolAddress,
      abi: POOL_ABI,
      functionName: 'getCommitments',
      args: [BigInt(start), BigInt(end)],
    }) as `0x${string}`[];

    commitments.push(...batch.map(c => c.toString()));
  }

  // Build ZK proof (recipient = 0x0 for in-pool transfer)
  onProgress?.('Building ZK proof...');
  const result = await prepareTransaction({
    commitments,
    inputs: selectedUtxos,
    outputs,
    fee: 0,
    recipient: '0x0000000000000000000000000000000000000000',
    relayer: '0x0000000000000000000000000000000000000000',
    onProgress,
    provingKeyPath,
  });

  // Submit to relay
  onProgress?.('Submitting to relay...');
  const relayResult = await submitRelay({
    type: 'transfer',
    pool,
    relayUrl,
    proofArgs: {
      proof: result.args.proof,
      root: result.args.root,
      inputNullifiers: result.args.inputNullifiers,
      outputCommitments: result.args.outputCommitments as [string, string],
      publicAmount: result.args.publicAmount,
      extDataHash: result.args.extDataHash,
    },
    extData: result.extData,
    metadata: {
      amount,
      recipient: 'self',
      inputUtxoCount: selectedUtxos.length,
      outputUtxoCount: outputs.length,
    },
  });

  return {
    success: relayResult.success,
    transactionHash: relayResult.transactionHash,
    blockNumber: relayResult.blockNumber,
    amount,
    slot: normalizedSlot,
    pool,
  };
}
