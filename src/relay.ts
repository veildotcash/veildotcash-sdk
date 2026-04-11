/**
 * Relay functions for submitting withdrawals and transfers
 * 
 * The relay service handles transaction submission for privacy-preserving
 * withdrawals and transfers from Veil pools.
 * 
 * Note: Public API is rate limited to 5 requests per minute per IP.
 * 
 * @example
 * ```typescript
 * import { submitRelay } from '@veil-cash/sdk';
 * 
 * const result = await submitRelay({
 *   type: 'withdraw',
 *   pool: 'eth',
 *   proofArgs: { ... },
 *   extData: { ... },
 *   metadata: { amount: '0.1' }
 * });
 * 
 * console.log(result.transactionHash);
 * ```
 */

import { getRelayUrl } from './addresses.js';
import type {
  RelayPool,
  RelayResponse,
  RelayErrorResponse,
  SubmitRelayOptions,
} from './types.js';

/**
 * Error thrown when relay request fails
 */
export class RelayError extends Error {
  /** HTTP status code */
  statusCode: number;
  /** Seconds until rate limit resets (only for 429 errors) */
  retryAfter?: number;
  /** Network the error occurred on */
  network?: string;

  constructor(message: string, statusCode: number, retryAfter?: number, network?: string) {
    super(message);
    this.name = 'RelayError';
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
    this.network = network;
  }
}

export async function postRelayJson<T>(
  endpoint: string,
  body: unknown,
  relayUrl?: string,
): Promise<T> {
  const url = relayUrl || getRelayUrl();
  const response = await fetch(`${url}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorData = data as RelayErrorResponse;
    throw new RelayError(
      errorData.error || errorData.message || 'Relay request failed',
      response.status,
      errorData.retryAfter,
      errorData.network,
    );
  }

  return data as T;
}

/**
 * Submit a withdrawal or transfer to the relay service
 * 
 * The relay service submits the transaction on behalf of the user,
 * allowing for privacy-preserving withdrawals and transfers.
 * 
 * Rate limit: 5 requests per minute per IP (public API)
 * 
 * @param options - Relay options including type, pool, proofArgs, extData
 * @returns Promise resolving to relay response with transaction hash
 * @throws RelayError if the request fails
 * 
 * @example
 * ```typescript
 * // Withdraw ETH
 * const result = await submitRelay({
 *   type: 'withdraw',
 *   pool: 'eth',
 *   proofArgs: proofData.args,
 *   extData: proofData.extData,
 *   metadata: { amount: '0.1', recipient: '0x...' }
 * });
 * 
 * // Transfer USDC
 * const result = await submitRelay({
 *   type: 'transfer',
 *   pool: 'usdc',
 *   proofArgs: proofData.args,
 *   extData: proofData.extData,
 *   metadata: { amount: '100' }
 * });
 * ```
 */
export async function submitRelay(options: SubmitRelayOptions): Promise<RelayResponse> {
  const {
    type,
    pool = 'eth',
    proofArgs,
    extData,
    metadata,
    relayUrl: customRelayUrl,
  } = options;

  // Validate inputs
  if (type !== 'withdraw' && type !== 'transfer') {
    throw new RelayError('Invalid type. Must be "withdraw" or "transfer"', 400);
  }

  if (pool !== 'eth' && pool !== 'usdc') {
    throw new RelayError('Invalid pool. Must be "eth" or "usdc"', 400);
  }

  if (!proofArgs || !extData) {
    throw new RelayError('Missing proofArgs or extData', 400);
  }

  const relayUrl = customRelayUrl || getRelayUrl();
  const endpoint = `/relay/${pool}`;
  return postRelayJson<RelayResponse>(
    endpoint,
    {
      type,
      proofArgs,
      extData,
      metadata,
    },
    relayUrl,
  );
}

/**
 * Check if relay service is healthy
 * 
 * @param relayUrl - Optional custom relay URL
 * @returns Promise resolving to health status
 * 
 * @example
 * ```typescript
 * const health = await checkRelayHealth();
 * console.log(health.status); // 'ok'
 * console.log(health.network); // 'base'
 * ```
 */
export async function checkRelayHealth(relayUrl?: string): Promise<{
  status: string;
  service: string;
  network: string;
  timestamp: string;
}> {
  const url = relayUrl || getRelayUrl();
  const response = await fetch(`${url}/health`);

  if (!response.ok) {
    throw new RelayError('Relay service health check failed', response.status);
  }

  return response.json() as Promise<{
    status: string;
    service: string;
    network: string;
    timestamp: string;
  }>;
}

/**
 * Get relay service info
 * 
 * @param relayUrl - Optional custom relay URL
 * @returns Promise resolving to service info including rate limit config
 * 
 * @example
 * ```typescript
 * const info = await getRelayInfo();
 * console.log(info.rateLimit.limit); // 5
 * console.log(info.rateLimit.windowMs); // 60000
 * ```
 */
export async function getRelayInfo(relayUrl?: string): Promise<{
  service: string;
  version: string;
  network: string;
  endpoints: Record<string, string>;
  rateLimit: {
    limit: number;
    windowMs: number;
    note: string;
  };
}> {
  const url = relayUrl || getRelayUrl();
  const response = await fetch(url);

  if (!response.ok) {
    throw new RelayError('Failed to get relay service info', response.status);
  }

  return response.json() as Promise<{
    service: string;
    version: string;
    network: string;
    endpoints: Record<string, string>;
    rateLimit: {
      limit: number;
      windowMs: number;
      note: string;
    };
  }>;
}
