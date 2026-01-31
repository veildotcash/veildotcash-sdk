/**
 * CLI configuration handling
 */

import type { WalletConfig } from './wallet.js';

export interface CLIOptions {
  walletKey?: string;
  rpcUrl?: string;
}

/**
 * Get wallet configuration from CLI options and environment variables
 */
export function getConfig(options: CLIOptions): WalletConfig {
  const walletKey = options.walletKey || process.env.WALLET_KEY;
  const rpcUrl = options.rpcUrl || process.env.RPC_URL || 'https://mainnet.base.org';

  if (!walletKey) {
    throw new Error('Wallet key required. Use --wallet-key or set WALLET_KEY environment variable.');
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
