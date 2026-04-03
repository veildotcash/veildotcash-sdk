/**
 * Transfer CLI command
 */

import { Command } from 'commander';
import { Keypair } from '../../keypair.js';
import { transfer, mergeUtxos } from '../../transfer.js';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';
import { clearProgress, createProgressReporter, printFields, printHeader, printJson, printLine, txUrl } from '../output.js';
import type { RelayPool } from '../../types.js';

const SUPPORTED_ASSETS = ['ETH', 'USDC'];

export function createTransferCommand(): Command {
  const transferCmd = new Command('transfer')
    .description('Transfer privately within the pool to another registered address')
    .argument('<asset>', 'Asset to transfer (ETH or USDC)')
    .argument('<amount>', 'Amount to transfer (e.g., 0.1)')
    .argument('<recipient>', 'Recipient address (must be registered)')
    .option('--json', 'Output as JSON')
    .addHelpText('after', `
Examples:
  veil transfer ETH 0.02 0xRecipientAddress
  veil transfer USDC 25 0xRecipientAddress
  veil transfer ETH 0.02 0xRecipientAddress --json
`)
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
        const veilKey = process.env.VEIL_KEY;
        if (!veilKey) {
          throw new CLIError(ErrorCode.VEIL_KEY_MISSING, 'VEIL_KEY required. Set VEIL_KEY env');
        }

        const senderKeypair = new Keypair(veilKey);
        const rpcUrl = process.env.RPC_URL;
        const pool = assetUpper.toLowerCase() as RelayPool;
        const onProgress = createProgressReporter();
        onProgress(`Starting ${assetUpper} transfer...`);

        // Execute transfer
        const result = await transfer({
          amount,
          recipientAddress: recipient as `0x${string}`,
          senderKeypair,
          pool,
          rpcUrl,
          onProgress,
        });

        clearProgress();

        const output = {
          success: result.success,
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
          asset: assetUpper,
          amount: result.amount,
          recipient: result.recipient,
          type: 'transfer',
        };

        if (options.json) {
          printJson(output);
          return;
        }

        printHeader('Transfer Submitted');
        printFields([
          { label: 'Asset', value: assetUpper },
          { label: 'Amount', value: result.amount },
          { label: 'Recipient', value: result.recipient },
          { label: 'Transaction', value: txUrl(result.transactionHash) },
          { label: 'Block', value: result.blockNumber },
        ]);
        printLine();
      } catch (error) {
        clearProgress();
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
    .option('--json', 'Output as JSON')
    .addHelpText('after', `
Examples:
  veil merge ETH 0.1
  veil merge USDC 100
  veil merge ETH 0.1 --json
`)
    .action(async (asset: string, amount: string, options) => {
      try {
        const assetUpper = asset.toUpperCase();

        // Validate asset
        if (!SUPPORTED_ASSETS.includes(assetUpper)) {
          throw new CLIError(ErrorCode.INVALID_AMOUNT, `Unsupported asset: ${asset}. Supported: ${SUPPORTED_ASSETS.join(', ')}`);
        }

        // Get keypair
        const veilKey = process.env.VEIL_KEY;
        if (!veilKey) {
          throw new CLIError(ErrorCode.VEIL_KEY_MISSING, 'VEIL_KEY required. Set VEIL_KEY env');
        }

        const keypair = new Keypair(veilKey);
        const rpcUrl = process.env.RPC_URL;
        const pool = assetUpper.toLowerCase() as RelayPool;
        const onProgress = createProgressReporter();
        onProgress(`Starting ${assetUpper} merge (self-transfer)...`);

        // Execute merge
        const result = await mergeUtxos({
          amount,
          keypair,
          pool,
          rpcUrl,
          onProgress,
        });

        clearProgress();

        const output = {
          success: result.success,
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
          asset: assetUpper,
          amount: result.amount,
          type: 'merge',
        };

        if (options.json) {
          printJson(output);
          return;
        }

        printHeader('Merge Submitted');
        printFields([
          { label: 'Asset', value: assetUpper },
          { label: 'Amount', value: result.amount },
          { label: 'Transaction', value: txUrl(result.transactionHash) },
          { label: 'Block', value: result.blockNumber },
        ]);
        printLine();
      } catch (error) {
        clearProgress();
        handleCLIError(error);
      }
    });

  return mergeCmd;
}
