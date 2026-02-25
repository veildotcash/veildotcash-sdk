/**
 * Transfer CLI command
 */

import { Command } from 'commander';
import { Keypair } from '../../keypair.js';
import { transfer, mergeUtxos } from '../../transfer.js';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';
import type { RelayPool } from '../../types.js';

const SUPPORTED_ASSETS = ['ETH', 'USDC'];

// Progress helper - writes to stderr so JSON output stays clean
function progress(msg: string, quiet?: boolean) {
  if (!quiet) {
    process.stderr.write(`\r\x1b[K${msg}`);
  }
}

export function createTransferCommand(): Command {
  const transferCmd = new Command('transfer')
    .description('Transfer privately within the pool to another registered address')
    .argument('<asset>', 'Asset to transfer (ETH or USDC)')
    .argument('<amount>', 'Amount to transfer (e.g., 0.1)')
    .argument('<recipient>', 'Recipient address (must be registered)')
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

        const senderKeypair = new Keypair(veilKey);
        const rpcUrl = options.rpcUrl || process.env.RPC_URL;
        const pool = assetUpper.toLowerCase() as RelayPool;

        // Progress callback
        const onProgress = options.quiet
          ? undefined
          : (stage: string, detail?: string) => {
              const msg = detail ? `${stage}: ${detail}` : stage;
              progress(msg, options.quiet);
            };

        progress(`Starting ${assetUpper} transfer...`, options.quiet);

        // Execute transfer
        const result = await transfer({
          amount,
          recipientAddress: recipient as `0x${string}`,
          senderKeypair,
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
          type: 'transfer',
        }, null, 2));
        process.exit(0);
      } catch (error) {
        progress('', options.quiet);
        handleCLIError(error);
      }
    });

  return transferCmd;
}

export function createMergeCommand(): Command {
  const mergeCmd = new Command('merge')
    .description('Merge UTXOs by self-transfer (consolidate small UTXOs)')
    .argument('<asset>', 'Asset to merge (ETH or USDC)')
    .argument('<amount>', 'Amount to merge (e.g., 0.5)')
    .option('--veil-key <key>', 'Veil private key (or set VEIL_KEY env)')
    .option('--rpc-url <url>', 'RPC URL (or set RPC_URL env)')
    .option('--quiet', 'Suppress progress output')
    .action(async (asset: string, amount: string, options) => {
      try {
        const assetUpper = asset.toUpperCase();

        // Validate asset
        if (!SUPPORTED_ASSETS.includes(assetUpper)) {
          throw new CLIError(ErrorCode.INVALID_AMOUNT, `Unsupported asset: ${asset}. Supported: ${SUPPORTED_ASSETS.join(', ')}`);
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

        progress(`Starting ${assetUpper} merge (self-transfer)...`, options.quiet);

        // Execute merge
        const result = await mergeUtxos({
          amount,
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
          type: 'merge',
        }, null, 2));
        process.exit(0);
      } catch (error) {
        progress('', options.quiet);
        handleCLIError(error);
      }
    });

  return mergeCmd;
}
