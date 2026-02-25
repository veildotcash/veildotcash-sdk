/**
 * Withdraw CLI command
 */

import { Command } from 'commander';
import { Keypair } from '../../keypair.js';
import { withdraw } from '../../withdraw.js';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';
import type { RelayPool } from '../../types.js';

const SUPPORTED_ASSETS = ['ETH', 'USDC'];

// Progress helper - writes to stderr so JSON output stays clean
function progress(msg: string, quiet?: boolean) {
  if (!quiet) {
    process.stderr.write(`\r\x1b[K${msg}`);
  }
}

export function createWithdrawCommand(): Command {
  const withdrawCmd = new Command('withdraw')
    .description('Withdraw from private pool to a public address')
    .argument('<asset>', 'Asset to withdraw (ETH or USDC)')
    .argument('<amount>', 'Amount to withdraw (e.g., 0.1)')
    .argument('<recipient>', 'Recipient address (e.g., 0x...)')
    .option('--veil-key <key>', 'Veil private key (or set VEIL_KEY env)')
    .option('--rpc-url <url>', 'RPC URL (or set RPC_URL env)')
    .option('--quiet', 'Suppress progress output')
    .action(async (asset: string, amount: string, recipient: string, options) => {
      try {
        const assetUpper = asset.toUpperCase();

        // Validate asset
        if (!SUPPORTED_ASSETS.includes(assetUpper)) {
          throw new CLIError(ErrorCode.INVALID_AMOUNT, `Unsupported asset: ${asset}. Supported: ${SUPPORTED_ASSETS.join(', ')}`);
        }

        // Validate recipient
        if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
          throw new CLIError(ErrorCode.INVALID_ADDRESS, 'Invalid recipient address format');
        }

        // Get keypair
        const veilKey = options.veilKey || process.env.VEIL_KEY;
        if (!veilKey) {
          throw new CLIError(ErrorCode.VEIL_KEY_MISSING, 'VEIL_KEY required. Use --veil-key or set VEIL_KEY env');
        }

        const keypair = new Keypair(veilKey);
        const rpcUrl = options.rpcUrl || process.env.RPC_URL;
        const pool = assetUpper.toLowerCase() as RelayPool;

        // Progress callback
        const onProgress = options.quiet
          ? undefined
          : (stage: string, detail?: string) => {
              const msg = detail ? `${stage}: ${detail}` : stage;
              progress(msg, options.quiet);
            };

        progress(`Starting ${assetUpper} withdrawal...`, options.quiet);

        // Execute withdrawal
        const result = await withdraw({
          amount,
          recipient: recipient as `0x${string}`,
          keypair,
          pool,
          rpcUrl,
          onProgress,
        });

        // Clear progress line
        progress('', options.quiet);

        // Output result
        console.log(JSON.stringify({
          success: result.success,
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
          asset: assetUpper,
          amount: result.amount,
          recipient: result.recipient,
        }, null, 2));
        process.exit(0);
      } catch (error) {
        progress('', options.quiet);
        handleCLIError(error);
      }
    });

  return withdrawCmd;
}
