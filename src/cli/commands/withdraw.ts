/**
 * Withdraw CLI command
 */

import { Command } from 'commander';
import { Keypair } from '../../keypair.js';
import { withdraw } from '../../withdraw.js';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';
import { clearProgress, createProgressReporter, printFields, printHeader, printJson, printLine, txUrl } from '../output.js';
import type { RelayPool } from '../../types.js';

const SUPPORTED_ASSETS = ['ETH', 'USDC'];

export function createWithdrawCommand(): Command {
  const withdrawCmd = new Command('withdraw')
    .description('Withdraw from private pool to a public address')
    .argument('<asset>', 'Asset to withdraw (ETH or USDC)')
    .argument('<amount>', 'Amount to withdraw (e.g., 0.1)')
    .argument('<recipient>', 'Recipient address (e.g., 0x...)')
    .option('--veil-key <key>', 'Veil private key (or set VEIL_KEY env)')
    .option('--rpc-url <url>', 'RPC URL (or set RPC_URL env)')
    .option('--json', 'Output as JSON')
    .addHelpText('after', `
Examples:
  veil withdraw ETH 0.05 0xRecipientAddress
  veil withdraw USDC 50 0xRecipientAddress
  veil withdraw ETH 0.05 0xRecipientAddress --json
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
        const veilKey = options.veilKey || process.env.VEIL_KEY;
        if (!veilKey) {
          throw new CLIError(ErrorCode.VEIL_KEY_MISSING, 'VEIL_KEY required. Use --veil-key or set VEIL_KEY env');
        }

        const keypair = new Keypair(veilKey);
        const rpcUrl = options.rpcUrl || process.env.RPC_URL;
        const pool = assetUpper.toLowerCase() as RelayPool;
        const onProgress = createProgressReporter();
        onProgress(`Starting ${assetUpper} withdrawal...`);

        // Execute withdrawal
        const result = await withdraw({
          amount,
          recipient: recipient as `0x${string}`,
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
          recipient: result.recipient,
        };

        if (options.json) {
          printJson(output);
          return;
        }

        printHeader('Withdrawal Submitted');
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

  return withdrawCmd;
}
