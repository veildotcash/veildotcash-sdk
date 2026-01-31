/**
 * Register CLI command - Register your deposit key on-chain
 */

import { Command } from 'commander';
import { buildRegisterTx } from '../../deposit.js';
import { sendTransaction, getAddress, isRegistered } from '../wallet.js';
import { getConfig } from '../config.js';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';

export function createRegisterCommand(): Command {
  const register = new Command('register')
    .description('Register your deposit key on-chain (one-time)')
    .option('--deposit-key <key>', 'Your Veil deposit key (or set DEPOSIT_KEY env)')
    .option('--wallet-key <key>', 'Ethereum wallet key for signing (or set WALLET_KEY env)')
    .option('--address <address>', 'Owner address (required with --unsigned)')
    .option('--rpc-url <url>', 'RPC URL (or set RPC_URL env)')
    .option('--unsigned', 'Output unsigned transaction payload (Bankr-compatible format)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const jsonOutput = options.json;

      try {
        // Get deposit key from option or env
        const depositKey = options.depositKey || process.env.DEPOSIT_KEY;
        if (!depositKey) {
          throw new CLIError(ErrorCode.DEPOSIT_KEY_MISSING, 'Deposit key required. Run "veil init" first or use --deposit-key');
        }

        // Handle --unsigned mode (no wallet required, just build payload)
        if (options.unsigned) {
          let address: `0x${string}`;
          if (options.address) {
            address = options.address as `0x${string}`;
          } else {
            const walletKey = options.walletKey || process.env.WALLET_KEY;
            if (!walletKey) {
              throw new CLIError(ErrorCode.WALLET_KEY_MISSING, 'Must provide --address or --wallet-key for --unsigned mode');
            }
            address = getAddress(walletKey as `0x${string}`);
          }

          const tx = buildRegisterTx(depositKey, address);

          const payload = {
            to: tx.to,
            data: tx.data,
            value: '0',
            chainId: 8453,
          };

          console.log(JSON.stringify(payload, null, 2));
          process.exit(0);
          return;
        }

        // Regular mode: sign and send
        const config = getConfig(options);
        const address = getAddress(config.privateKey);

        // Check if already registered
        if (!jsonOutput) console.log('\nChecking registration status...');
        const { registered, depositKey: existingKey } = await isRegistered(address, config.rpcUrl);
        
        if (registered) {
          if (jsonOutput) {
            console.log(JSON.stringify({
              success: true,
              alreadyRegistered: true,
              address,
              depositKey: existingKey,
            }, null, 2));
          } else {
            console.log(`\nAddress ${address} is already registered.`);
            console.log(`\nExisting deposit key:`);
            console.log(`  ${existingKey}`);
          }
          process.exit(0);
          return;
        }

        if (!jsonOutput) {
          console.log('Registering deposit key...');
          console.log(`  Address: ${address}`);
          console.log(`  Deposit Key: ${depositKey.slice(0, 40)}...`);
        }

        // Build and send
        const tx = buildRegisterTx(depositKey, address);
        const result = await sendTransaction(config, tx);

        if (result.receipt.status === 'success') {
          if (jsonOutput) {
            console.log(JSON.stringify({
              success: true,
              alreadyRegistered: false,
              address,
              transactionHash: result.hash,
              blockNumber: result.receipt.blockNumber.toString(),
              gasUsed: result.receipt.gasUsed.toString(),
            }, null, 2));
          } else {
            console.log('\nRegistration successful!');
            console.log(`  Transaction: ${result.hash}`);
            console.log(`  Block: ${result.receipt.blockNumber}`);
            console.log(`  Gas used: ${result.receipt.gasUsed}`);
            console.log('\nNext step: veil deposit <amount>');
          }
          process.exit(0);
        } else {
          throw new CLIError(ErrorCode.CONTRACT_ERROR, `Transaction reverted: ${result.hash}`);
        }
      } catch (error) {
        handleCLIError(error);
      }
    });

  return register;
}
