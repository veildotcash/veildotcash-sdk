/**
 * Deposit CLI command
 */

import { Command } from 'commander';
import { buildDepositETHTx } from '../../deposit.js';
import { sendTransaction, getAddress, getBalance } from '../wallet.js';
import { getConfig } from '../config.js';
import { parseEther, formatEther } from 'viem';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';

// Minimum deposit: 0.01 ETH (net after 0.3% fee)
// To deposit 0.01 ETH net, you need to send: 0.01 / (1 - 0.003) ≈ 0.01003 ETH
const MINIMUM_DEPOSIT_ETH = 0.01;
const DEPOSIT_FEE_PERCENT = 0.3;
const MINIMUM_DEPOSIT_WITH_FEE = MINIMUM_DEPOSIT_ETH / (1 - DEPOSIT_FEE_PERCENT / 100);

// Progress helper - writes to stderr so JSON output stays clean
function progress(msg: string, quiet?: boolean) {
  if (!quiet) {
    process.stderr.write(`\r\x1b[K${msg}`);
  }
}

export function createDepositCommand(): Command {
  const deposit = new Command('deposit')
    .description('Deposit ETH into Veil')
    .argument('<amount>', 'Amount to deposit (e.g., 0.1)')
    .option('--deposit-key <key>', 'Your Veil deposit key (or set DEPOSIT_KEY env)')
    .option('--wallet-key <key>', 'Ethereum wallet key for signing (or set WALLET_KEY env)')
    .option('--rpc-url <url>', 'RPC URL (or set RPC_URL env)')
    .option('--unsigned', 'Output unsigned transaction payload (Bankr-compatible format)')
    .option('--quiet', 'Suppress progress output')
    .action(async (amount: string, options) => {
      try {
        const amountNum = parseFloat(amount);
        
        // Check minimum deposit
        if (amountNum < MINIMUM_DEPOSIT_WITH_FEE) {
          throw new CLIError(
            ErrorCode.INVALID_AMOUNT,
            `Minimum deposit is ${MINIMUM_DEPOSIT_ETH} ETH (net). ` +
            `With ${DEPOSIT_FEE_PERCENT}% fee, send at least ${MINIMUM_DEPOSIT_WITH_FEE.toFixed(5)} ETH.`
          );
        }

        // Get deposit key from option or env
        const depositKey = options.depositKey || process.env.DEPOSIT_KEY;
        if (!depositKey) {
          throw new CLIError(ErrorCode.DEPOSIT_KEY_MISSING, 'Deposit key required. Use --deposit-key or set DEPOSIT_KEY in .env (run: veil init)');
        }

        progress('Building transaction...', options.quiet);

        // Build the transaction
        const tx = buildDepositETHTx({
          depositKey,
          amount,
        });

        // Handle --unsigned mode (no wallet required, just build payload)
        if (options.unsigned) {
          progress('', options.quiet); // Clear line
          // Output Bankr-compatible format
          const payload = {
            to: tx.to,
            data: tx.data,
            value: tx.value ? tx.value.toString() : '0',
            chainId: 8453, // Base mainnet
          };

          console.log(JSON.stringify(payload, null, 2));
          return;
        }

        // Regular mode: sign and send
        const config = getConfig(options);
        const address = getAddress(config.privateKey);

        progress('Checking balance...', options.quiet);

        // Check balance
        const balance = await getBalance(address, config.rpcUrl);
        const amountWei = parseEther(amount);
        
        if (balance < amountWei) {
          progress('', options.quiet);
          throw new CLIError(ErrorCode.INSUFFICIENT_BALANCE, `Insufficient ETH balance. Have: ${formatEther(balance)} ETH, Need: ${amount} ETH`);
        }

        progress('Sending transaction...', options.quiet);

        // Send the transaction
        const result = await sendTransaction(config, tx);

        progress('Confirming...', options.quiet);

        // Clear progress line
        progress('', options.quiet);

        console.log(JSON.stringify({
          success: result.receipt.status === 'success',
          hash: result.hash,
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
