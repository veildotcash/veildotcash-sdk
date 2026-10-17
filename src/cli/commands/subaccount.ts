import { Command } from 'commander';
import { isAddress } from 'viem';
import {
  buildSubaccountRecoveryTx,
  getSubaccountStatus,
  MAX_SUBACCOUNT_SLOTS,
  mergeSubaccount,
} from '../../subaccount.js';
import { getConfig } from '../config.js';
import { CLIError, ErrorCode, handleCLIError } from '../errors.js';
import { printFields, printHeader, printJson, printLine, printList, printSection, txUrl } from '../output.js';
import { sendTransaction } from '../wallet.js';
import type { SubaccountAsset, RelayPool } from '../../types.js';

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

function parsePool(raw: string): RelayPool {
  const pool = raw.toLowerCase();
  if (pool !== 'eth' && pool !== 'usdc') {
    throw new CLIError(ErrorCode.INVALID_AMOUNT, `Unsupported pool: ${raw}. Supported: eth, usdc`);
  }
  return pool;
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
    .description('Recover funds from retired Veil subaccounts')
    .addHelpText('after', `
Subaccounts are retired. Do not send funds to subaccount forwarder addresses.
These commands exist only to recover funds that are already there.

Examples:
  veil subaccount status --slot 0
  veil subaccount merge --slot 0 --pool eth
  veil subaccount recover --slot 0 --asset usdc --to 0xRecipientAddress --amount 25
`);

  subaccount
    .command('status')
    .description('Show retired subaccount state for recovery (forwarder balances, private balances, queues)')
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

        printHeader(`Subaccount Slot ${status.slot.slot} (retired)`);
        printLine(status.notice);
        printLine();
        printFields([
          { label: 'Forwarder (do not fund)', value: status.slot.forwarderAddress },
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

        printSection('Private Pool Balances');
        printFields([
          {
            label: 'ETH',
            value: `${status.privateBalances.eth.privateBalance} ETH (${status.privateBalances.eth.unspentCount} unspent / ${status.privateBalances.eth.spentCount} spent / ${status.privateBalances.eth.utxoCount} total UTXOs)`,
          },
          {
            label: 'USDC',
            value: `${status.privateBalances.usdc.privateBalance} USDC (${status.privateBalances.usdc.unspentCount} unspent / ${status.privateBalances.usdc.spentCount} spent / ${status.privateBalances.usdc.utxoCount} total UTXOs)`,
          },
        ]);

        printQueueHuman('ETH Queue', status.queues.eth);
        printQueueHuman('USDC Queue', status.queues.usdc);

        const hasForwarderFunds =
          status.balances.eth.balanceWei !== '0' || status.balances.usdc.balanceWei !== '0';
        if (hasForwarderFunds) {
          printSection('Recovery');
          printLine(
            status.deployed
              ? 'Forwarder holds funds. Run `veil subaccount recover --slot <n> --asset <eth|usdc> --to <address> --amount <value>`.'
              : 'Forwarder holds funds but is not deployed. Contact Veil support to have it deployed, then run `veil subaccount recover`.',
          );
        }
        printLine();
      } catch (error) {
        handleCLIError(error);
      }
    });

  subaccount
    .command('merge')
    .description('Merge a subaccount\'s private pool balance back to the main wallet')
    .requiredOption('--slot <n>', 'Subaccount slot', parseSlotValue)
    .option('--pool <pool>', 'Pool to merge (eth or usdc)', parsePool, 'eth' as RelayPool)
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const rootPrivateKey = getRequiredVeilKey();
        const result = await mergeSubaccount({
          rootPrivateKey,
          slot: options.slot,
          pool: options.pool,
          rpcUrl: process.env.RPC_URL,
          relayUrl: process.env.RELAY_URL,
          onProgress: options.json
            ? undefined
            : (stage, detail) => {
                const msg = detail ? `${stage} ${detail}` : stage;
                process.stderr.write(`\r\x1b[K${msg}`);
              },
        });

        if (!options.json) {
          process.stderr.write('\r\x1b[K');
        }

        const output = {
          success: result.success,
          slot: result.slot,
          pool: result.pool,
          amount: result.amount,
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
        };

        if (options.json) {
          printJson(output);
          return;
        }

        printHeader('Subaccount Merge Submitted');
        printFields([
          { label: 'Slot', value: result.slot },
          { label: 'Pool', value: result.pool.toUpperCase() },
          { label: 'Amount', value: result.amount },
          { label: 'Transaction', value: txUrl(result.transactionHash) },
          { label: 'Block', value: result.blockNumber },
        ]);
        printLine();
      } catch (error) {
        if (!options.json) {
          process.stderr.write('\r\x1b[K');
        }
        handleCLIError(error);
      }
    });

  subaccount
    .command('recover')
    .description('Recover assets sitting on a deployed subaccount forwarder with an owner-signed withdraw transaction')
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
        if (!process.env.WALLET_KEY) {
          throw new CLIError(
            ErrorCode.WALLET_KEY_MISSING,
            'WALLET_KEY required for recovery. Recovery submits a transaction on-chain and needs a gas payer.',
          );
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

  return subaccount;
}
