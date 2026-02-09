/**
 * Register CLI command - Register your deposit key on-chain
 */

import { Command } from 'commander';
import { buildRegisterTx, buildChangeDepositKeyTx } from '../../deposit.js';
import { sendTransaction, getAddress, isRegistered } from '../wallet.js';
import { getConfig } from '../config.js';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';

export function createRegisterCommand(): Command {
  const register = new Command('register')
    .description('Register or update your deposit key on-chain')
    .option('--deposit-key <key>', 'Your Veil deposit key (or set DEPOSIT_KEY env)')
    .option('--wallet-key <key>', 'Ethereum wallet key for signing (or set WALLET_KEY env)')
    .option('--address <address>', 'Owner address (required with --unsigned)')
    .option('--rpc-url <url>', 'RPC URL (or set RPC_URL env)')
    .option('--unsigned', 'Output unsigned transaction payload (Bankr-compatible format)')
    .option('--force', 'Change deposit key even if already registered')
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

          // Use changeDepositKey if --force is set, otherwise register
          const tx = options.force
            ? buildChangeDepositKeyTx(depositKey, address)
            : buildRegisterTx(depositKey, address);

          const payload = {
            action: options.force ? 'changeDepositKey' : 'register',
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
        
        // Determine if this is a new registration or a key change
        const keysMatch = registered && existingKey === depositKey;
        const isChange = registered && !keysMatch;

        if (registered && keysMatch) {
          // Already registered with the same key -- nothing to do
          if (jsonOutput) {
            console.log(JSON.stringify({
              success: true,
              alreadyRegistered: true,
              keysMatch: true,
              address,
              depositKey: existingKey,
            }, null, 2));
          } else {
            console.log(`\nAddress ${address} is already registered with this deposit key.`);
            console.log(`\nDeposit key: ${existingKey!.slice(0, 40)}...`);
          }
          process.exit(0);
          return;
        }

        if (isChange && !options.force) {
          // Registered with a different key but --force not provided
          if (jsonOutput) {
            console.log(JSON.stringify({
              success: false,
              alreadyRegistered: true,
              keysMatch: false,
              address,
              onChainKey: existingKey,
              localKey: depositKey.slice(0, 40) + '...',
              hint: 'Use --force to change deposit key',
            }, null, 2));
          } else {
            console.log(`\nAddress ${address} is already registered with a different deposit key.`);
            console.log(`\n  On-chain key: ${existingKey!.slice(0, 40)}...`);
            console.log(`  Local key:    ${depositKey.slice(0, 40)}...`);
            console.log(`\nUse --force to change your deposit key on-chain.`);
          }
          process.exit(1);
          return;
        }

        // Build the appropriate transaction
        const action = isChange ? 'Changing deposit key' : 'Registering deposit key';
        if (!jsonOutput) {
          console.log(`${action}...`);
          console.log(`  Address: ${address}`);
          console.log(`  Deposit Key: ${depositKey.slice(0, 40)}...`);
        }

        const tx = isChange
          ? buildChangeDepositKeyTx(depositKey, address)
          : buildRegisterTx(depositKey, address);
        const result = await sendTransaction(config, tx);

        if (result.receipt.status === 'success') {
          if (jsonOutput) {
            console.log(JSON.stringify({
              success: true,
              action: isChange ? 'changed' : 'registered',
              address,
              transactionHash: result.hash,
              blockNumber: result.receipt.blockNumber.toString(),
              gasUsed: result.receipt.gasUsed.toString(),
            }, null, 2));
          } else {
            console.log(isChange ? '\nDeposit key changed successfully!' : '\nRegistration successful!');
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
