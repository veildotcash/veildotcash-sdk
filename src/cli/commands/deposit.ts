/**
 * Deposit CLI command
 */

import { Command } from 'commander';
import { buildDepositETHTx, buildDepositUSDCTx, buildApproveUSDCTx } from '../../deposit.js';
import { sendTransaction, getAddress, getBalance } from '../wallet.js';
import { getConfig } from '../config.js';
import { createPublicClient, http, parseEther, parseUnits, formatEther, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';
import { clearProgress, createProgressReporter, printFields, printHeader, printJson, printLine, txUrl } from '../output.js';
import { POOL_CONFIG, getAddresses } from '../../addresses.js';
import { ENTRY_ABI, ERC20_ABI } from '../../abi.js';
import type { TransactionData } from '../../types.js';

const MINIMUM_NET: Record<string, number> = {
  ETH: 0.01,
  USDC: 10,
};

/**
 * Query the Entry contract for the exact gross amount (net + fee).
 * This matches the contract's own fee math and avoids rounding mismatches.
 */
async function getGrossAmount(
  netWei: bigint,
  rpcUrl: string | undefined,
): Promise<{ grossWei: bigint; feeWei: bigint }> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  const grossWei = await publicClient.readContract({
    address: getAddresses().entry,
    abi: ENTRY_ABI,
    functionName: 'getDepositAmountWithFee',
    args: [netWei],
  }) as bigint;

  return { grossWei, feeWei: grossWei - netWei };
}

const SUPPORTED_ASSETS = ['ETH', 'USDC'];

export function createDepositCommand(): Command {
  const deposit = new Command('deposit')
    .description('Deposit ETH or USDC into Veil')
    .argument('<asset>', 'Asset to deposit (ETH or USDC)')
    .argument('<amount>', 'Amount to deposit — this is what arrives in your Veil balance')
    .option('--unsigned', 'Output unsigned transaction payload instead of sending')
    .option('--json', 'Output as JSON')
    .addHelpText('after', `
The amount you specify is the net amount that lands in your Veil balance.
The 0.3% protocol fee is automatically added on top.

Examples:
  veil deposit ETH 0.1          # deposits 0.1 ETH (sends ~0.1003 ETH)
  veil deposit USDC 100         # deposits 100 USDC (sends ~100.30 USDC)
  veil deposit ETH 0.1 --unsigned
  veil deposit ETH 0.1 --json
`)
    .action(async (asset: string, amount: string, options) => {
      try {
        const assetUpper = asset.toUpperCase();

        if (!SUPPORTED_ASSETS.includes(assetUpper)) {
          throw new CLIError(ErrorCode.INVALID_AMOUNT, `Unsupported asset: ${asset}. Supported: ${SUPPORTED_ASSETS.join(', ')}`);
        }

        const amountNum = parseFloat(amount);
        const minimumNet = MINIMUM_NET[assetUpper];

        if (amountNum < minimumNet) {
          throw new CLIError(
            ErrorCode.INVALID_AMOUNT,
            `Minimum deposit is ${minimumNet} ${assetUpper}.`
          );
        }

        const rpcUrl = process.env.RPC_URL;
        const poolConfig = POOL_CONFIG[assetUpper.toLowerCase() as 'eth' | 'usdc'];
        const netWei = assetUpper === 'ETH'
          ? parseEther(amount)
          : parseUnits(amount, poolConfig.decimals);

        const progress = createProgressReporter();
        progress('Calculating fee...');

        const { grossWei, feeWei } = await getGrossAmount(netWei, rpcUrl);
        const grossStr = assetUpper === 'ETH'
          ? formatEther(grossWei)
          : formatUnits(grossWei, poolConfig.decimals);
        const feeStr = assetUpper === 'ETH'
          ? formatEther(feeWei)
          : formatUnits(feeWei, poolConfig.decimals);

        const depositKey = process.env.DEPOSIT_KEY;
        if (!depositKey) {
          throw new CLIError(ErrorCode.DEPOSIT_KEY_MISSING, 'DEPOSIT_KEY not set. Run "veil init" first.');
        }

        progress('Building transaction...');

        let tx: TransactionData;
        let approveTx: TransactionData | null = null;

        if (assetUpper === 'USDC') {
          approveTx = buildApproveUSDCTx({ amount: grossStr });
          tx = buildDepositUSDCTx({ depositKey, amount: grossStr });
        } else {
          tx = buildDepositETHTx({ depositKey, amount: grossStr });
        }

        // --unsigned mode
        if (options.unsigned) {
          clearProgress();
          const payloads: Record<string, unknown>[] = [];

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

          printJson(payloads.length === 1 ? payloads[0] : payloads);
          return;
        }

        const config = getConfig(options);
        const address = getAddress(config.privateKey);

        if (assetUpper === 'ETH') {
          progress('Checking balance...');
          const balance = await getBalance(address, config.rpcUrl);

          if (balance < grossWei) {
            clearProgress();
            throw new CLIError(
              ErrorCode.INSUFFICIENT_BALANCE,
              `Insufficient ETH balance. Have: ${formatEther(balance)} ETH, Need: ${grossStr} ETH (${amount} + fee)`
            );
          }
        }

        if (approveTx) {
          progress(`Approving ${assetUpper}...`);
          const approvalResult = await sendTransaction(config, approveTx);
          if (assetUpper === 'USDC') {
            const publicClient = createPublicClient({
              chain: base,
              transport: http(config.rpcUrl),
            });
            const addresses = getAddresses();
            let allowance = await publicClient.readContract({
              address: getAddresses().usdcToken,
              abi: ERC20_ABI,
              functionName: 'allowance',
              args: [address, addresses.entry],
            }) as bigint;
            for (let confirmations = 2; allowance < grossWei && confirmations <= 3; confirmations++) {
              await publicClient.waitForTransactionReceipt({
                hash: approvalResult.hash,
                confirmations,
              });
              allowance = await publicClient.readContract({
                address: addresses.usdcToken,
                abi: ERC20_ABI,
                functionName: 'allowance',
                args: [address, addresses.entry],
              }) as bigint;
            }
            if (allowance < grossWei) {
              throw new CLIError(
                ErrorCode.CONTRACT_ERROR,
                `USDC approval is not yet visible on RPC after confirmation. Allowance ${allowance.toString()} < required ${grossWei.toString()}.`
              );
            }
          }
        }

        progress('Sending deposit transaction...');
        const result = await sendTransaction(config, tx);
        progress('Confirming...');
        clearProgress();

        const output = {
          success: result.receipt.status === 'success',
          hash: result.hash,
          asset: assetUpper,
          amount,
          fee: feeStr,
          totalSent: grossStr,
          blockNumber: result.receipt.blockNumber.toString(),
        };

        if (options.json) {
          printJson(output);
          return;
        }

        printHeader('Deposit Submitted');
        printFields([
          { label: 'Asset', value: assetUpper },
          { label: 'Amount', value: `${amount} ${assetUpper}` },
          { label: 'Fee', value: `${feeStr} ${assetUpper} (0.3%)` },
          { label: 'Total sent', value: `${grossStr} ${assetUpper}` },
          { label: 'From', value: address },
          { label: 'Transaction', value: txUrl(result.hash) },
          { label: 'Block', value: result.receipt.blockNumber },
        ]);
        printLine();
      } catch (error) {
        clearProgress();
        handleCLIError(error);
      }
    });

  return deposit;
}
