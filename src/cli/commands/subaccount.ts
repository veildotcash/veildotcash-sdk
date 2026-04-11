import { Command } from 'commander';
import { isAddress } from 'viem';
import {
  buildSubaccountRecoveryTx,
  deploySubaccountForwarder,
  deriveSubaccountSlot,
  getSubaccountStatus,
  isSubaccountForwarderDeployed,
  MAX_SUBACCOUNT_SLOTS,
  sweepSubaccountForwarder,
} from '../../subaccount.js';
import { getConfig } from '../config.js';
import { CLIError, ErrorCode, handleCLIError } from '../errors.js';
import { printFields, printHeader, printJson, printLine, printList, printSection, txUrl } from '../output.js';
import { sendTransaction } from '../wallet.js';
import type { SubaccountAsset } from '../../types.js';

function parseSlotValue(raw: string): number {
  const normalized = raw.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new CLIError(ErrorCode.INVALID_SLOT, '--slot must be a non-negative integer');
  }

  const slot = Number(normalized);
  if (slot >= MAX_SUBACCOUNT_SLOTS) {
    throw new CLIError(
      ErrorCode.INVALID_SLOT,
      `--slot must be 0-${MAX_SUBACCOUNT_SLOTS - 1} (max ${MAX_SUBACCOUNT_SLOTS} subaccounts supported)`,
    );
  }

  return slot;
}

function getRequiredVeilKey(): `0x${string}` {
  const veilKey = process.env.VEIL_KEY;
  if (!veilKey) {
    throw new CLIError(ErrorCode.VEIL_KEY_MISSING, 'VEIL_KEY required. Set VEIL_KEY env');
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(veilKey)) {
    throw new CLIError(ErrorCode.VEIL_KEY_MISSING, 'VEIL_KEY must be a 0x-prefixed 32-byte hex string');
  }
  return veilKey as `0x${string}`;
}

function parseAsset(raw: string): SubaccountAsset {
  const asset = raw.toLowerCase();
  if (asset !== 'eth' && asset !== 'usdc') {
    throw new CLIError(ErrorCode.INVALID_AMOUNT, `Unsupported asset: ${raw}. Supported: eth, usdc`);
  }
  return asset;
}

function printQueueHuman(
  title: string,
  queue: {
    queueBalance: string;
    pendingCount: number;
    pendingDeposits: Array<{ nonce: string; amount: string; status: string }>;
  },
): void {
  printSection(title);
  printFields([
    { label: 'Queue balance', value: queue.queueBalance },
    { label: 'Pending', value: queue.pendingCount },
  ]);

  if (queue.pendingDeposits.length > 0) {
    printList(
      queue.pendingDeposits.map((deposit) => `nonce ${deposit.nonce}: ${deposit.amount} (${deposit.status})`),
    );
  }
}

export function createSubaccountCommand(): Command {
  const subaccount = new Command('subaccount')
    .description('Manage Veil subaccounts')
    .addHelpText('after', `
Examples:
  veil subaccount derive --slot 0
  veil subaccount status --slot 0
  veil subaccount deploy --slot 0
  veil subaccount sweep --slot 0 --asset eth
  veil subaccount recover --slot 0 --asset usdc --to 0xRecipientAddress --amount 25
  veil subaccount address --slot 0
`);

  subaccount
    .command('derive')
    .description('Derive subaccount metadata for a slot')
    .requiredOption('--slot <n>', 'Subaccount slot', parseSlotValue)
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const rootPrivateKey = getRequiredVeilKey();
        const rpcUrl = process.env.RPC_URL;
        const slot = await deriveSubaccountSlot({
          rootPrivateKey,
          slot: options.slot,
          rpcUrl,
        });
        const deployed = await isSubaccountForwarderDeployed({
          forwarderAddress: slot.forwarderAddress,
          rpcUrl,
        });

        const output = {
          ...slot,
          deployed,
        };

        if (options.json) {
          printJson(output);
          return;
        }

        printHeader(`Subaccount Slot ${slot.slot}`);
        printFields([
          { label: 'Child owner', value: slot.childOwner },
          { label: 'Deposit key', value: slot.childDepositKey },
          { label: 'Salt', value: slot.salt },
          { label: 'Forwarder', value: slot.forwarderAddress },
          { label: 'Deployed', value: deployed },
        ]);
        printLine();
      } catch (error) {
        handleCLIError(error);
      }
    });

  subaccount
    .command('status')
    .description('Show subaccount deployment, balances, and queue state')
    .requiredOption('--slot <n>', 'Subaccount slot', parseSlotValue)
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const rootPrivateKey = getRequiredVeilKey();
        const status = await getSubaccountStatus({
          rootPrivateKey,
          slot: options.slot,
          rpcUrl: process.env.RPC_URL,
        });

        if (options.json) {
          printJson(status);
          return;
        }

        printHeader(`Subaccount Slot ${status.slot.slot}`);
        printFields([
          { label: 'Forwarder', value: status.slot.forwarderAddress },
          { label: 'Child owner', value: status.slot.childOwner },
          { label: 'Deposit key', value: status.slot.childDepositKey },
          { label: 'Salt', value: status.slot.salt },
          { label: 'Deployed', value: status.deployed },
        ]);

        printSection('Forwarder Balances');
        printFields([
          { label: 'ETH', value: `${status.balances.eth.balance} ETH` },
          { label: 'USDC', value: `${status.balances.usdc.balance} USDC` },
        ]);

        printQueueHuman('ETH Queue', status.queues.eth);
        printQueueHuman('USDC Queue', status.queues.usdc);
        printLine();
      } catch (error) {
        handleCLIError(error);
      }
    });

  subaccount
    .command('deploy')
    .description('Deploy a subaccount forwarder through the relay')
    .requiredOption('--slot <n>', 'Subaccount slot', parseSlotValue)
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const rootPrivateKey = getRequiredVeilKey();
        const slot = await deriveSubaccountSlot({
          rootPrivateKey,
          slot: options.slot,
          rpcUrl: process.env.RPC_URL,
        });
        const result = await deploySubaccountForwarder({
          rootPrivateKey,
          slot: options.slot,
          rpcUrl: process.env.RPC_URL,
          relayUrl: process.env.RELAY_URL,
        });

        const output = {
          ...result,
          slot: options.slot,
          forwarderAddress: slot.forwarderAddress,
        };

        if (options.json) {
          printJson(output);
          return;
        }

        printHeader('Subaccount Deploy Submitted');
        printFields([
          { label: 'Slot', value: options.slot },
          { label: 'Forwarder', value: slot.forwarderAddress },
          { label: 'Transaction', value: txUrl(result.transactionHash) },
          { label: 'Block', value: result.blockNumber },
        ]);
        printLine();
      } catch (error) {
        handleCLIError(error);
      }
    });

  subaccount
    .command('sweep')
    .description('Sweep ETH or USDC from a subaccount forwarder through the relay')
    .requiredOption('--slot <n>', 'Subaccount slot', parseSlotValue)
    .requiredOption('--asset <asset>', 'Asset to sweep (eth or usdc)', parseAsset)
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const rootPrivateKey = getRequiredVeilKey();
        const slot = await deriveSubaccountSlot({
          rootPrivateKey,
          slot: options.slot,
          rpcUrl: process.env.RPC_URL,
        });
        const result = await sweepSubaccountForwarder({
          forwarderAddress: slot.forwarderAddress,
          asset: options.asset,
          relayUrl: process.env.RELAY_URL,
        });

        const output = {
          ...result,
          slot: options.slot,
          asset: options.asset,
          forwarderAddress: slot.forwarderAddress,
        };

        if (options.json) {
          printJson(output);
          return;
        }

        printHeader('Subaccount Sweep Submitted');
        printFields([
          { label: 'Slot', value: options.slot },
          { label: 'Asset', value: options.asset.toUpperCase() },
          { label: 'Forwarder', value: slot.forwarderAddress },
          { label: 'Transaction', value: txUrl(result.transactionHash) },
          { label: 'Block', value: result.blockNumber },
        ]);
        printLine();
      } catch (error) {
        handleCLIError(error);
      }
    });

  subaccount
    .command('recover')
    .description('Recover assets sitting on the subaccount forwarder with a direct withdraw transaction')
    .requiredOption('--slot <n>', 'Subaccount slot', parseSlotValue)
    .requiredOption('--asset <asset>', 'Asset to recover (eth or usdc)', parseAsset)
    .requiredOption('--to <address>', 'Recipient address')
    .requiredOption('--amount <value>', 'Amount to recover')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const rootPrivateKey = getRequiredVeilKey();
        if (!isAddress(options.to)) {
          throw new CLIError(ErrorCode.INVALID_ADDRESS, `Invalid recipient address: ${options.to}`);
        }
        const config = getConfig({});
        const recovery = await buildSubaccountRecoveryTx({
          rootPrivateKey,
          slot: options.slot,
          asset: options.asset,
          to: options.to as `0x${string}`,
          amount: options.amount,
          rpcUrl: process.env.RPC_URL,
        });
        const result = await sendTransaction(config, recovery.transaction);

        const output = {
          success: result.receipt.status === 'success',
          slot: options.slot,
          asset: recovery.asset,
          amount: recovery.amount,
          amountWei: recovery.amountWei,
          forwarderAddress: recovery.forwarderAddress,
          recipient: recovery.recipient,
          nonce: recovery.nonce,
          deadline: recovery.deadline,
          signature: recovery.signature,
          transactionHash: result.hash,
          blockNumber: result.receipt.blockNumber.toString(),
        };

        if (options.json) {
          printJson(output);
          return;
        }

        printHeader('Subaccount Recovery Submitted');
        printFields([
          { label: 'Slot', value: options.slot },
          { label: 'Asset', value: recovery.asset.toUpperCase() },
          { label: 'Amount', value: recovery.amount },
          { label: 'Recipient', value: recovery.recipient },
          { label: 'Forwarder', value: recovery.forwarderAddress },
          { label: 'Nonce', value: recovery.nonce },
          { label: 'Transaction', value: txUrl(result.hash) },
          { label: 'Block', value: result.receipt.blockNumber },
        ]);
        printLine();
      } catch (error) {
        handleCLIError(error);
      }
    });

  subaccount
    .command('address')
    .description('Print the predicted forwarder address for a subaccount slot')
    .requiredOption('--slot <n>', 'Subaccount slot', parseSlotValue)
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const rootPrivateKey = getRequiredVeilKey();
        const slot = await deriveSubaccountSlot({
          rootPrivateKey,
          slot: options.slot,
          rpcUrl: process.env.RPC_URL,
        });

        if (options.json) {
          printJson({
            slot: options.slot,
            forwarderAddress: slot.forwarderAddress,
          });
          return;
        }

        printLine(slot.forwarderAddress);
      } catch (error) {
        handleCLIError(error);
      }
    });

  return subaccount;
}
