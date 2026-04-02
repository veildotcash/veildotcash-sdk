/**
 * CLI configuration handling
 */

import { CLIError, ErrorCode } from './errors.js';
import { getAddress } from './wallet.js';
import type { WalletConfig } from './wallet.js';

export interface CLIOptions {
  rpcUrl?: string;
}

export interface AddressOptions {
  address?: string;
}

export interface ResolvedAddress {
  address: `0x${string}`;
  source: 'flag' | 'wallet-key' | 'signer-address';
}

function validateAddress(address: string, sourceLabel: string): `0x${string}` {
  const normalized = address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    throw new CLIError(ErrorCode.INVALID_ADDRESS, `${sourceLabel} must be a valid 0x-prefixed Ethereum address.`);
  }
  return normalized as `0x${string}`;
}

function ensureAddressEnvConsistency(): void {
  if (process.env.WALLET_KEY && process.env.SIGNER_ADDRESS) {
    throw new CLIError(
      ErrorCode.CONFIG_CONFLICT,
      'WALLET_KEY and SIGNER_ADDRESS are mutually exclusive. Set only one.',
    );
  }
}

/**
 * Get wallet configuration from CLI options and environment variables
 */
export function getConfig(options: CLIOptions): WalletConfig {
  ensureAddressEnvConsistency();
  const walletKey = process.env.WALLET_KEY;
  const rpcUrl = options.rpcUrl || process.env.RPC_URL || 'https://mainnet.base.org';

  if (!walletKey) {
    throw new Error('WALLET_KEY env var required. Set it before running this command.');
  }

  // Validate wallet key format
  if (!walletKey.startsWith('0x') || walletKey.length !== 66) {
    throw new Error('Invalid wallet key format. Must be a 0x-prefixed 64-character hex string.');
  }

  return {
    privateKey: walletKey as `0x${string}`,
    rpcUrl,
  };
}

/**
 * Get Veil private key from CLI options or environment
 */
export function getVeilKey(options: { veilKey?: string }): string | undefined {
  return options.veilKey || process.env.VEIL_KEY;
}

/**
 * Resolve an address for query / unsigned flows.
 * Prefers explicit --address, then derives from WALLET_KEY, then falls back to SIGNER_ADDRESS.
 */
export function resolveAddress(
  options: AddressOptions = {},
  config: { required?: boolean; allowInvalidWalletKey?: boolean } = {},
): ResolvedAddress | null {
  ensureAddressEnvConsistency();

  if (options.address) {
    return {
      address: validateAddress(options.address, '--address'),
      source: 'flag',
    };
  }

  const walletKey = process.env.WALLET_KEY;
  if (walletKey) {
    try {
      return {
        address: getAddress(walletKey as `0x${string}`),
        source: 'wallet-key',
      };
    } catch {
      if (!config.allowInvalidWalletKey) {
        throw new CLIError(
          ErrorCode.WALLET_KEY_MISSING,
          'Invalid WALLET_KEY format. Must be a 0x-prefixed 64-character hex string.',
        );
      }
    }
  }

  const signerAddress = process.env.SIGNER_ADDRESS;
  if (signerAddress) {
    return {
      address: validateAddress(signerAddress, 'SIGNER_ADDRESS'),
      source: 'signer-address',
    };
  }

  if (config.required) {
    throw new CLIError(
      ErrorCode.WALLET_KEY_MISSING,
      'Must provide --address, set SIGNER_ADDRESS, or set WALLET_KEY env.',
    );
  }

  return null;
}

/**
 * Load environment variables from .env.veil and .env files
 */
export function loadEnv(): void {
  try {
    // Dynamic import to avoid bundling issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dotenv = require('dotenv');
    
    // Load .env.veil first (Veil-specific config)
    dotenv.config({ path: '.env.veil', quiet: true });
    
    // Then load .env (for WALLET_KEY, RPC_URL if not in .env.veil)
    dotenv.config({ quiet: true });
  } catch {
    // dotenv not available, skip
  }
}
