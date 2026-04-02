/**
 * Register CLI command - Register your deposit key on-chain
 */

import { Command } from 'commander';
import { buildRegisterTx, buildChangeDepositKeyTx } from '../../deposit.js';
import { sendTransaction, getAddress, isRegistered } from '../wallet.js';
import { getConfig, resolveAddress } from '../config.js';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';
import { maskValue, printFields, printHeader, printJson, printLine, txUrl } from '../output.js';

export function createRegisterCommand(): Command {
  const register = new Command('register')
    .description('Register or update your deposit key on-chain')
    .option('--address <address>', 'Signer address (optional if SIGNER_ADDRESS or WALLET_KEY is set in --unsigned mode)')
    .option('--unsigned', 'Output unsigned transaction payload instead of sending')
    .option('--force', 'Change deposit key even if already registered')
    .option('--json', 'Output as JSON')
    .addHelpText('after', `
Examples:
  veil register
  veil register --force
  veil register --unsigned --address 0x...
  SIGNER_ADDRESS=0x... veil register --unsigned
  veil register --json
`)
    .action(async (options) => {
      const jsonOutput = options.json;

      try {
        // Get deposit key from option or env
        const depositKey = process.env.DEPOSIT_KEY;
        if (!depositKey) {
          throw new CLIError(ErrorCode.DEPOSIT_KEY_MISSING, 'DEPOSIT_KEY not set. Run "veil init" first.');
        }

        // Handle --unsigned mode (no wallet required, just build payload)
        if (options.unsigned) {
          const resolvedAddress = resolveAddress({ address: options.address }, { required: true });
          if (!resolvedAddress) {
            throw new CLIError(
              ErrorCode.WALLET_KEY_MISSING,
              'Must provide --address, set SIGNER_ADDRESS, or set WALLET_KEY env.',
            );
          }
          const address = resolvedAddress.address;

          const rpcUrl = process.env.RPC_URL;
          const isChange = options.force
            ? (await isRegistered(address, rpcUrl)).registered
            : false;
          const tx = isChange
            ? buildChangeDepositKeyTx(depositKey, address)
            : buildRegisterTx(depositKey, address);

          const payload = {
            action: isChange ? 'changeDepositKey' : 'register',
            to: tx.to,
            data: tx.data,
            value: '0',
            chainId: 8453,
          };

          printJson(payload);
          return;
        }

        // Regular mode: sign and send
        const config = getConfig(options);
        const address = getAddress(config.privateKey);

        // Check if already registered
        if (!jsonOutput) printLine('Checking registration status...');
        const { registered, depositKey: existingKey } = await isRegistered(address, config.rpcUrl);
        
        // Determine if this is a new registration or a key change
        const keysMatch = registered && existingKey === depositKey;

        if (registered && keysMatch && !options.force) {
          if (jsonOutput) {
            printJson({
              success: true,
              alreadyRegistered: true,
              keysMatch: true,
              address,
              depositKey: existingKey,
            });
          } else {
            printHeader('Already Registered');
            printFields([
              { label: 'Address', value: address },
              { label: 'Deposit key', value: maskValue(existingKey!) },
            ]);
            printLine();
          }
          return;
        }

        if (registered && !keysMatch && !options.force) {
          if (jsonOutput) {
            printJson({
              success: false,
              alreadyRegistered: true,
              keysMatch: false,
              address,
              onChainKey: existingKey,
              localKey: depositKey.slice(0, 40) + '...',
              hint: 'Use --force to change deposit key',
            });
          } else {
            printLine('A different deposit key is already registered');
            printFields([
              { label: 'Address', value: address },
              { label: 'On-chain key', value: maskValue(existingKey!) },
              { label: 'Local key', value: maskValue(depositKey) },
            ]);
            printLine('');
            printLine('Use `veil register --force` to change your deposit key on-chain.');
          }
          process.exit(1);
          return;
        }

        const isChange = registered && options.force;

        // Build the appropriate transaction
        const action = isChange ? 'Changing deposit key' : 'Registering deposit key';
        if (!jsonOutput) {
          printLine(`${action}...`);
          printFields([
            { label: 'Address', value: address },
            { label: 'Deposit key', value: maskValue(depositKey) },
          ]);
        }

        const tx = isChange
          ? buildChangeDepositKeyTx(depositKey, address)
          : buildRegisterTx(depositKey, address);
        const result = await sendTransaction(config, tx);

        if (result.receipt.status === 'success') {
          if (jsonOutput) {
            printJson({
              success: true,
              action: isChange ? 'changed' : 'registered',
              address,
              transactionHash: result.hash,
              blockNumber: result.receipt.blockNumber.toString(),
            });
          } else {
            printLine(isChange ? 'Deposit key changed successfully' : 'Registration successful');
            printFields([
              { label: 'Transaction', value: txUrl(result.hash) },
              { label: 'Block', value: result.receipt.blockNumber },
            ]);
            printLine('');
            printLine('Next step: veil deposit <asset> <amount>');
          }
        } else {
          throw new CLIError(ErrorCode.CONTRACT_ERROR, `Transaction reverted: ${result.hash}`);
        }
      } catch (error) {
        handleCLIError(error);
      }
    });

  return register;
}
