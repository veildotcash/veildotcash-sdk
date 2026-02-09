/**
 * Deposit CLI command
 */

import { Command } from 'commander';
import { buildDepositETHTx, buildDepositUSDCTx, buildApproveUSDCTx, buildDepositCBBTCTx, buildApproveCBBTCTx } from '../../deposit.js';
import { sendTransaction, getAddress, getBalance } from '../wallet.js';
import { getConfig } from '../config.js';
import { parseEther, formatEther } from 'viem';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';
import type { TransactionData } from '../../types.js';

// Minimum deposits per asset (net after 0.3% fee)
const DEPOSIT_FEE_PERCENT = 0.3;
const MINIMUM_DEPOSITS: Record<string, number> = {
  ETH: 0.01,
  USDC: 10,
  CBBTC: 0.0001,
};

function getMinimumWithFee(asset: string): number {
  const min = MINIMUM_DEPOSITS[asset] || 0;
  return min / (1 - DEPOSIT_FEE_PERCENT / 100);
}

const SUPPORTED_ASSETS = ['ETH', 'USDC', 'CBBTC'];

// Progress helper - writes to stderr so JSON output stays clean
function progress(msg: string, quiet?: boolean) {
  if (!quiet) {
    process.stderr.write(`\r\x1b[K${msg}`);
  }
}

export function createDepositCommand(): Command {
  const deposit = new Command('deposit')
    .description('Deposit ETH, USDC, or cbBTC into Veil')
    .argument('<asset>', 'Asset to deposit (ETH, USDC, or CBBTC)')
    .argument('<amount>', 'Amount to deposit (e.g., 0.1)')
    .option('--deposit-key <key>', 'Your Veil deposit key (or set DEPOSIT_KEY env)')
    .option('--wallet-key <key>', 'Ethereum wallet key for signing (or set WALLET_KEY env)')
    .option('--rpc-url <url>', 'RPC URL (or set RPC_URL env)')
    .option('--unsigned', 'Output unsigned transaction payload (Bankr-compatible format)')
    .option('--quiet', 'Suppress progress output')
    .action(async (asset: string, amount: string, options) => {
      try {
        const assetUpper = asset.toUpperCase();

        // Validate asset
        if (!SUPPORTED_ASSETS.includes(assetUpper)) {
          throw new CLIError(ErrorCode.INVALID_AMOUNT, `Unsupported asset: ${asset}. Supported: ${SUPPORTED_ASSETS.join(', ')}`);
        }

        const amountNum = parseFloat(amount);
        const minimumWithFee = getMinimumWithFee(assetUpper);
        const minimumNet = MINIMUM_DEPOSITS[assetUpper];
        
        // Check minimum deposit
        if (amountNum < minimumWithFee) {
          throw new CLIError(
            ErrorCode.INVALID_AMOUNT,
            `Minimum deposit is ${minimumNet} ${assetUpper} (net). ` +
            `With ${DEPOSIT_FEE_PERCENT}% fee, send at least ${minimumWithFee.toFixed(assetUpper === 'ETH' ? 5 : 8)} ${assetUpper}.`
          );
        }

        // Get deposit key from option or env
        const depositKey = options.depositKey || process.env.DEPOSIT_KEY;
        if (!depositKey) {
          throw new CLIError(ErrorCode.DEPOSIT_KEY_MISSING, 'Deposit key required. Use --deposit-key or set DEPOSIT_KEY in .env (run: veil init)');
        }

        progress('Building transaction...', options.quiet);

        // Build the deposit transaction
        let tx: TransactionData;
        let approveTx: TransactionData | null = null;

        if (assetUpper === 'USDC') {
          approveTx = buildApproveUSDCTx({ amount });
          tx = buildDepositUSDCTx({ depositKey, amount });
        } else if (assetUpper === 'CBBTC') {
          approveTx = buildApproveCBBTCTx({ amount });
          tx = buildDepositCBBTCTx({ depositKey, amount });
        } else {
          tx = buildDepositETHTx({ depositKey, amount });
        }

        // Handle --unsigned mode (no wallet required, just build payload)
        if (options.unsigned) {
          progress('', options.quiet); // Clear line
          const payloads: Record<string, unknown>[] = [];

          // Include approval tx for ERC20 tokens
          if (approveTx) {
            payloads.push({
              step: 'approve',
              to: approveTx.to,
              data: approveTx.data,
              value: '0',
              chainId: 8453,
            });
          }

          payloads.push({
            step: 'deposit',
            to: tx.to,
            data: tx.data,
            value: tx.value ? tx.value.toString() : '0',
            chainId: 8453,
          });

          console.log(JSON.stringify(payloads.length === 1 ? payloads[0] : payloads, null, 2));
          return;
        }

        // Regular mode: sign and send
        const config = getConfig(options);
        const address = getAddress(config.privateKey);

        // For ETH deposits, check ETH balance
        if (assetUpper === 'ETH') {
          progress('Checking balance...', options.quiet);
          const balance = await getBalance(address, config.rpcUrl);
          const amountWei = parseEther(amount);
          
          if (balance < amountWei) {
            progress('', options.quiet);
            throw new CLIError(ErrorCode.INSUFFICIENT_BALANCE, `Insufficient ETH balance. Have: ${formatEther(balance)} ETH, Need: ${amount} ETH`);
          }
        }

        // Send approval transaction for ERC20 tokens
        if (approveTx) {
          progress(`Approving ${assetUpper}...`, options.quiet);
          await sendTransaction(config, approveTx);
        }

        progress('Sending deposit transaction...', options.quiet);

        // Send the deposit transaction
        const result = await sendTransaction(config, tx);

        progress('Confirming...', options.quiet);

        // Clear progress line
        progress('', options.quiet);

        console.log(JSON.stringify({
          success: result.receipt.status === 'success',
          hash: result.hash,
          asset: assetUpper,
          amount,
          blockNumber: result.receipt.blockNumber.toString(),
          gasUsed: result.receipt.gasUsed.toString(),
        }, null, 2));
      } catch (error) {
        progress('', options.quiet); // Clear progress line
        handleCLIError(error);
      }
    });

  return deposit;
}
