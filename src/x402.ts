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
} from 'viem';
import { privateKeyToAccount, privateKeyToAddress } from 'viem/accounts';
import { base } from 'viem/chains';
import { ADDRESSES, getRelayUrl } from './addresses.js';
import { Keypair } from './keypair.js';
import { submitRelay } from './relay.js';
import { buildWithdrawProof } from './withdraw.js';
import type { ProvingKeyPath } from './prover.js';

const X402_PAYER_DOMAIN = 'veil-x402-payer';
const BASE_NETWORK = `eip155:${ADDRESSES.chainId}` as const;

export interface PayX402ResourceOptions {
  url: string;
  rootPrivateKey: `0x${string}`;
  payerIndex: bigint | number | string;
  rpcUrl?: string;
  relayUrl?: string;
  fetchImpl?: typeof fetch;
  init?: RequestInit;
  provingKeyPath?: ProvingKeyPath;
  onProgress?: (stage: string, detail?: string) => void;
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
  return formatUnits(BigInt(atomic), 6);
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

  options.onProgress?.('Funding x402 payer...', `${amount} USDC to ${payerAccount.address}`);
  const proof = await buildWithdrawProof({
    amount,
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
      amount,
      amountAtomic,
      recipient: payerAccount.address,
      inputUtxoCount: proof.inputCount,
      outputUtxoCount: proof.outputCount,
      x402: true,
      payerIndex: payerIndex.toString(),
    },
  });

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
    relayTransactionHash: relayResult.transactionHash,
    relayBlockNumber: relayResult.blockNumber,
    paymentResponse,
    paymentTransactionHash: paymentResponse?.transaction,
  };
}
