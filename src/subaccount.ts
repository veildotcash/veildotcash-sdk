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
import { FORWARDER_ABI, FORWARDER_FACTORY_ABI, ERC20_ABI } from './abi.js';
import { FORWARDER_CONTRACT_VERSION, getAddresses, getForwarderFactoryAddress } from './addresses.js';
import { getQueueBalance } from './balance.js';
import { Keypair } from './keypair.js';
import { postRelayJson } from './relay.js';
import type {
  SubaccountAsset,
  SubaccountDeployRequest,
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

export async function getSubaccountStatus(options: {
  rootPrivateKey: `0x${string}`;
  slot: number;
  rpcUrl?: string;
}): Promise<SubaccountStatusResult> {
  const slot = await deriveSubaccountSlot(options);
  const publicClient = createBaseClient(options.rpcUrl);
  const addresses = getAddresses();

  const [deployed, ethWei, usdcWei, ethQueue, usdcQueue] = await Promise.all([
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
