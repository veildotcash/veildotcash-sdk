import { x402Client, x402HTTPClient } from '@x402/core/client';
import type { PaymentRequired, PaymentRequirements, SettleResponse } from '@x402/core/types';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { toClientEvmSigner } from '@x402/evm';
import {
  createPublicClient,
  encodePacked,
  formatUnits,
  http,
  isAddress,
  keccak256,
  parseUnits,
} from 'viem';
import { privateKeyToAccount, privateKeyToAddress } from 'viem/accounts';
import { base } from 'viem/chains';
import { ADDRESSES, POOL_CONFIG, getRelayUrl } from './addresses.js';
import { ERC20_ABI } from './abi.js';
import { Keypair } from './keypair.js';
import { submitRelay } from './relay.js';
import { buildWithdrawProof } from './withdraw.js';
import type { ProvingKeyPath } from './prover.js';

const X402_PAYER_DOMAIN = 'veil-x402-payer';
const BASE_NETWORK = `eip155:${ADDRESSES.chainId}` as const;
const USDC_DECIMALS = POOL_CONFIG.usdc.decimals;

// The /x402 relay route enforces a minimum withdrawal (default 0.001 USDC =
// 1000 atomic). A top-up shortfall below this floor is bumped up to it; the payer
// then ends slightly above the price, leaving a sub-min residue drained next reuse.
const X402_MIN_WITHDRAW_ATOMIC = 1000n;

export interface PayX402ResourceOptions {
  url: string;
  rootPrivateKey: `0x${string}`;
  payerIndex: bigint | number | string;
  rpcUrl?: string;
  relayUrl?: string;
  /**
   * Maximum USDC the caller will pay for this resource, as a human-readable
   * decimal string (e.g. "0.10" or "10"). If the merchant's x402 requirement
   * exceeds this cap, the payment is rejected before any proof is built or the
   * payer EOA is funded. Prefer setting a tight per-request cap.
   */
  maxPayment?: string;
  fetchImpl?: typeof fetch;
  init?: RequestInit;
  provingKeyPath?: ProvingKeyPath;
  onProgress?: (stage: string, detail?: string) => void;
  /**
   * Fired immediately after the payer EOA is funded by the relay, before the
   * x402 payment is signed and submitted. Lets callers persist a funded-state
   * record so that funds are traceable even if a later step (signing, the second
   * fetch, settle-header parse) fails. Best-effort: callback errors are ignored.
   */
  onPayerFunded?: (info: X402PayerFundedInfo) => void;
  /**
   * Controls funding when the derived payer EOA already holds USDC:
   * - `true`: if the payer holds >= the required amount, skip the relay-funded
   *   withdrawal and pay from that balance; throws if the balance is insufficient.
   * - `'topup'`: reuse the payer, withdrawing only the shortfall (amount - balance)
   *   when it holds less than the price. Drains stranded dust toward zero without a
   *   fresh full withdrawal; if the payer already holds enough, funding is skipped.
   * - `false`/undefined: always withdraw the full amount to the payer.
   * Use reuse to retry a payment whose funding succeeded but whose delivery failed.
   */
  reuseExistingBalance?: boolean | 'topup';
}

export interface X402PayerFundedInfo {
  payerAddress: `0x${string}`;
  payerIndex: string;
  amount: string;
  amountAtomic: string;
  relayTransactionHash: string;
  relayBlockNumber: string;
}

export interface PayX402ResourceResult {
  response: Response;
  payerAddress: `0x${string}`;
  payerIndex: string;
  amount: string;
  amountAtomic: string;
  relayTransactionHash: string;
  relayBlockNumber: string;
  paymentResponse?: SettleResponse;
  paymentTransactionHash?: string;
}

function assertPrivateKey(value: string, label: string): asserts value is `0x${string}` {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a 0x-prefixed 32-byte hex string`);
  }
}

function normalizePayerIndex(index: bigint | number | string): bigint {
  const normalized =
    typeof index === 'bigint'
      ? index
      : typeof index === 'number'
        ? BigInt(index)
        : BigInt(index);
  if (normalized < 0n) {
    throw new Error('payerIndex must be non-negative');
  }
  return normalized;
}

function normalizeAtomicAmount(amount: string): string {
  if (!/^\d+$/.test(amount)) {
    throw new Error(`x402 amount must be an atomic integer string, received: ${amount}`);
  }
  if (BigInt(amount) <= 0n) {
    throw new Error('x402 amount must be greater than 0');
  }
  return amount;
}

export function usdcAtomicToDecimalString(amountAtomic: string | bigint): string {
  const atomic = typeof amountAtomic === 'bigint' ? amountAtomic.toString() : normalizeAtomicAmount(amountAtomic);
  return formatUnits(BigInt(atomic), USDC_DECIMALS);
}

/**
 * Convert a human-readable USDC amount (e.g. "10" or "0.10") to atomic units.
 */
export function usdcDecimalToAtomic(amount: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(amount.trim())) {
    throw new Error(`Invalid USDC amount: ${amount}`);
  }
  return parseUnits(amount.trim(), USDC_DECIMALS);
}

export function deriveX402PayerKey(
  rootPrivateKey: string,
  index: bigint | number | string,
): `0x${string}` {
  assertPrivateKey(rootPrivateKey, 'rootPrivateKey');
  const normalizedIndex = normalizePayerIndex(index);
  return keccak256(
    encodePacked(
      ['bytes32', 'string', 'uint256'],
      [rootPrivateKey, X402_PAYER_DOMAIN, normalizedIndex],
    ),
  );
}

export function deriveX402PayerAddress(
  rootPrivateKey: string,
  index: bigint | number | string,
): `0x${string}` {
  return privateKeyToAddress(deriveX402PayerKey(rootPrivateKey, index));
}

export function selectBaseUsdcExactRequirement(paymentRequired: PaymentRequired): PaymentRequirements {
  if (paymentRequired.x402Version !== 2) {
    throw new Error(`Unsupported x402 version ${paymentRequired.x402Version}; expected v2`);
  }

  const requirement = paymentRequired.accepts.find((candidate) =>
    candidate.scheme === 'exact' &&
    candidate.network === BASE_NETWORK &&
    candidate.asset.toLowerCase() === ADDRESSES.usdcToken.toLowerCase()
  );

  if (!requirement) {
    throw new Error('No supported x402 payment requirement found. Veil supports x402 v2 exact Base USDC only.');
  }

  if (!isAddress(requirement.payTo)) {
    throw new Error('Selected x402 requirement has an invalid payTo address');
  }
  normalizeAtomicAmount(requirement.amount);
  return requirement;
}

async function parsePaymentRequired(response: Response, httpClient: x402HTTPClient): Promise<PaymentRequired> {
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    body = undefined;
  }

  return httpClient.getPaymentRequiredResponse(
    (name) => response.headers.get(name),
    body,
  );
}

export async function payX402Resource(options: PayX402ResourceOptions): Promise<PayX402ResourceResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('fetch is not available; pass fetchImpl');
  }

  const payerIndex = normalizePayerIndex(options.payerIndex);
  const payerPrivateKey = deriveX402PayerKey(options.rootPrivateKey, payerIndex);
  const payerAccount = privateKeyToAccount(payerPrivateKey);
  const publicClient = createPublicClient({
    chain: base,
    transport: http(options.rpcUrl),
  });
  const signer = toClientEvmSigner(payerAccount, publicClient);

  const client = new x402Client((_version, requirements) =>
    selectBaseUsdcExactRequirement({
      x402Version: 2,
      resource: { url: options.url },
      accepts: requirements,
    }),
  );
  registerExactEvmScheme(client, {
    signer,
    networks: [BASE_NETWORK],
    schemeOptions: options.rpcUrl ? { rpcUrl: options.rpcUrl } : undefined,
  });
  const httpClient = new x402HTTPClient(client);

  options.onProgress?.('Fetching x402 requirement...');
  const initialResponse = await fetchImpl(options.url, options.init);
  if (initialResponse.status !== 402) {
    return {
      response: initialResponse,
      payerAddress: payerAccount.address,
      payerIndex: payerIndex.toString(),
      amount: '0',
      amountAtomic: '0',
      relayTransactionHash: '',
      relayBlockNumber: '',
    };
  }

  const paymentRequired = await parsePaymentRequired(initialResponse, httpClient);
  const requirement = selectBaseUsdcExactRequirement(paymentRequired);
  const amountAtomic = normalizeAtomicAmount(requirement.amount);
  const amount = usdcAtomicToDecimalString(amountAtomic);

  // Enforce the spend cap before building a proof or funding the payer EOA so a
  // merchant cannot raise prices between calls and drain more than intended.
  if (options.maxPayment !== undefined) {
    const maxAtomic = usdcDecimalToAtomic(options.maxPayment);
    if (BigInt(amountAtomic) > maxAtomic) {
      throw new Error(
        `x402 payment of ${amount} USDC exceeds maxPayment cap of ${usdcAtomicToDecimalString(maxAtomic)} USDC. Payment was not sent.`,
      );
    }
  }

  // Decide whether to fund a fresh withdrawal or reuse an existing payer balance.
  // Reuse lets a caller retry a payment whose funding succeeded but whose delivery
  // failed (the USDC is still sitting on the payer EOA) without a second withdrawal.
  let relayTransactionHash = '';
  let relayBlockNumber = '';
  // How much USDC to actually withdraw to the payer. For a fresh payer this is the
  // full amount; when reusing, it is only the shortfall ('topup') or zero (the payer
  // already holds enough).
  let fundAtomic = BigInt(amountAtomic);
  if (options.reuseExistingBalance) {
    const payerBalance = (await publicClient.readContract({
      address: ADDRESSES.usdcToken,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [payerAccount.address],
    })) as bigint;
    if (payerBalance >= BigInt(amountAtomic)) {
      fundAtomic = 0n;
    } else if (options.reuseExistingBalance === 'topup') {
      // Drain dust: withdraw only the shortfall so the payer lands at ~exactly the
      // price after this payment, driving a stranded balance toward zero without a
      // fresh full withdrawal.
      fundAtomic = BigInt(amountAtomic) - payerBalance;
    } else {
      throw new Error(
        `Cannot reuse payer index ${payerIndex.toString()}: holds ${formatUnits(payerBalance, USDC_DECIMALS)} USDC but the resource requires ${amount} USDC. Pass reuseExistingBalance: 'topup' to fund the shortfall.`,
      );
    }
  }

  if (fundAtomic === 0n) {
    options.onProgress?.('Reusing funded x402 payer...', `${amount} USDC on ${payerAccount.address}`);
  } else {
    // Bump a sub-minimum shortfall up to the relay floor so the /x402 route accepts
    // it; the payer ends slightly above the price (residue drained on next reuse).
    if (fundAtomic < X402_MIN_WITHDRAW_ATOMIC) {
      fundAtomic = X402_MIN_WITHDRAW_ATOMIC;
    }
    const fundAmount = usdcAtomicToDecimalString(fundAtomic);
    options.onProgress?.('Funding x402 payer...', `${fundAmount} USDC to ${payerAccount.address}`);
    const proof = await buildWithdrawProof({
      amount: fundAmount,
      recipient: payerAccount.address,
      keypair: new Keypair(options.rootPrivateKey),
      pool: 'usdc',
      rpcUrl: options.rpcUrl,
      provingKeyPath: options.provingKeyPath,
      onProgress: options.onProgress,
    });
    const relayResult = await submitRelay({
      type: 'withdraw',
      pool: 'usdc',
      // x402 funding must target the low-minimum /x402 relay route. Default to it
      // so direct SDK consumers do not silently hit the main relay's 5 USDC floor.
      relayUrl: options.relayUrl ?? `${getRelayUrl()}/x402`,
      proofArgs: proof.proofArgs,
      extData: proof.extData,
      metadata: {
        amount: fundAmount,
        amountAtomic: fundAtomic.toString(),
        recipient: payerAccount.address,
        inputUtxoCount: proof.inputCount,
        outputUtxoCount: proof.outputCount,
        x402: true,
        payerIndex: payerIndex.toString(),
      },
    });
    relayTransactionHash = relayResult.transactionHash;
    relayBlockNumber = relayResult.blockNumber;

    // The payer is now funded. Notify the caller before signing so a funded-state
    // record can be persisted even if a later step throws and strands funds.
    if (options.onPayerFunded) {
      try {
        options.onPayerFunded({
          payerAddress: payerAccount.address,
          payerIndex: payerIndex.toString(),
          amount,
          amountAtomic,
          relayTransactionHash,
          relayBlockNumber,
        });
      } catch {
        // Best-effort notification; never let a logging callback abort the payment.
      }
    }
  }

  options.onProgress?.('Signing x402 payment...');
  const paymentPayload = await httpClient.createPaymentPayload({
    ...paymentRequired,
    accepts: [requirement],
  });
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  const headers = new Headers(options.init?.headers);
  for (const [key, value] of Object.entries(paymentHeaders)) {
    headers.set(key, value);
  }

  options.onProgress?.('Requesting paid resource...');
  const paidResponse = await fetchImpl(options.url, {
    ...options.init,
    headers,
  });

  let paymentResponse: SettleResponse | undefined;
  try {
    paymentResponse = httpClient.getPaymentSettleResponse((name) => paidResponse.headers.get(name));
  } catch {
    paymentResponse = undefined;
  }

  return {
    response: paidResponse,
    payerAddress: payerAccount.address,
    payerIndex: payerIndex.toString(),
    amount,
    amountAtomic,
    relayTransactionHash,
    relayBlockNumber,
    paymentResponse,
    paymentTransactionHash: paymentResponse?.transaction,
  };
}

export interface QuoteX402ResourceOptions {
  url: string;
  rpcUrl?: string;
  /**
   * Optional USDC spend cap (decimal string). When set, the result reports
   * whether the merchant's price exceeds it so a caller can refuse before paying.
   */
  maxPayment?: string;
  fetchImpl?: typeof fetch;
  init?: RequestInit;
}

export interface QuoteX402ResourceResult {
  /** True when the endpoint returned HTTP 402 (payment required). */
  requiresPayment: boolean;
  /** True when the 402 offers a Veil-supported exact Base USDC requirement. */
  supported: boolean;
  /** Initial HTTP status from the unpaid probe. */
  status: number;
  amount?: string;
  amountAtomic?: string;
  payTo?: string;
  network?: string;
  asset?: string;
  /** Set when maxPayment was supplied: true if the price exceeds the cap. */
  exceedsMax?: boolean;
  maxPayment?: string;
  /** Parsed response body for a non-402 probe, so the caller can see the error. */
  body?: unknown;
  /** Populated when a 402 was returned but no supported requirement could be parsed. */
  error?: string;
}

/**
 * Probe an x402 resource WITHOUT funding a payer or signing a payment. Returns
 * the price/requirement for a supported 402, or the raw response for anything
 * else, so a caller can validate the request and confirm cost before committing
 * a withdrawal. Note: a merchant that only validates the request body after
 * payment will still return 402 here; this cannot catch post-payment errors.
 */
export async function quoteX402Resource(options: QuoteX402ResourceOptions): Promise<QuoteX402ResourceResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('fetch is not available; pass fetchImpl');
  }

  // A selector-only client is enough to parse the 402; no signer/scheme needed
  // because we never sign or settle in a quote.
  const client = new x402Client((_version, requirements) =>
    selectBaseUsdcExactRequirement({
      x402Version: 2,
      resource: { url: options.url },
      accepts: requirements,
    }),
  );
  const httpClient = new x402HTTPClient(client);

  const initialResponse = await fetchImpl(options.url, options.init);
  if (initialResponse.status !== 402) {
    let body: unknown;
    try {
      body = await initialResponse.clone().json();
    } catch {
      try {
        body = await initialResponse.clone().text();
      } catch {
        body = undefined;
      }
    }
    return {
      requiresPayment: false,
      supported: false,
      status: initialResponse.status,
      body,
    };
  }

  let requirement: PaymentRequirements;
  try {
    const paymentRequired = await parsePaymentRequired(initialResponse, httpClient);
    requirement = selectBaseUsdcExactRequirement(paymentRequired);
  } catch (error) {
    return {
      requiresPayment: true,
      supported: false,
      status: 402,
      error: error instanceof Error ? error.message : 'Unsupported x402 requirement',
    };
  }

  const amountAtomic = normalizeAtomicAmount(requirement.amount);
  const amount = usdcAtomicToDecimalString(amountAtomic);
  let exceedsMax: boolean | undefined;
  if (options.maxPayment !== undefined) {
    exceedsMax = BigInt(amountAtomic) > usdcDecimalToAtomic(options.maxPayment);
  }

  return {
    requiresPayment: true,
    supported: true,
    status: 402,
    amount,
    amountAtomic,
    payTo: requirement.payTo,
    network: requirement.network,
    asset: requirement.asset,
    exceedsMax,
    maxPayment: options.maxPayment,
  };
}

export interface X402PayerBalance {
  payerIndex: string;
  payerAddress: `0x${string}`;
  usdc: string;
  usdcAtomic: string;
}

export interface GetX402PayerBalancesOptions {
  rootPrivateKey: `0x${string}`;
  startIndex?: bigint | number | string;
  count?: number;
  rpcUrl?: string;
  /** When true, only return payers that currently hold a non-zero USDC balance. */
  nonZeroOnly?: boolean;
}

/**
 * Inspect Base USDC balances held by deterministic x402 payer EOAs over an index
 * range. Useful for surfacing dust or funds left on a payer when a payment failed
 * after funding. This is read-only; it does not move funds or reuse payers.
 */
export async function getX402PayerBalances(
  options: GetX402PayerBalancesOptions,
): Promise<X402PayerBalance[]> {
  assertPrivateKey(options.rootPrivateKey, 'rootPrivateKey');
  const start = normalizePayerIndex(options.startIndex ?? 0n);
  const count = options.count ?? 16;
  if (!Number.isInteger(count) || count <= 0 || count > 256) {
    throw new Error('count must be an integer between 1 and 256');
  }

  const publicClient = createPublicClient({
    chain: base,
    transport: http(options.rpcUrl),
  });

  const results: X402PayerBalance[] = [];
  for (let i = 0; i < count; i++) {
    const index = start + BigInt(i);
    const payerAddress = deriveX402PayerAddress(options.rootPrivateKey, index);
    const balance = (await publicClient.readContract({
      address: ADDRESSES.usdcToken,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [payerAddress],
    })) as bigint;

    if (options.nonZeroOnly && balance === 0n) {
      continue;
    }

    results.push({
      payerIndex: index.toString(),
      payerAddress,
      usdc: formatUnits(balance, USDC_DECIMALS),
      usdcAtomic: balance.toString(),
    });
  }

  return results;
}
