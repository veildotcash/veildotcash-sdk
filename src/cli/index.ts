/**
 * Veil CLI - Command-line interface for Veil Cash
 * 
 * Usage:
 *   veil init                        # Generate keypair
 *   veil keypair                     # Show keypair (JSON)
 *   veil status                      # Check config and service status
 *   veil register                    # Register on-chain
 *   veil deposit ETH 0.1             # Deposit ETH
 *   veil balance                     # Show all balances
 *   veil queue-balance               # Show pending queue deposits
 *   veil private-balance             # Show private balance
 *   veil withdraw ETH 0.1 0x...      # Withdraw to public address
 *   veil transfer ETH 0.1 0x...      # Transfer privately
 *   veil merge ETH 0.5               # Merge UTXOs (self-transfer)
 */

import { Command } from 'commander';
import { loadEnv } from './config.js';
import { createInitCommand } from './commands/init.js';
import { createKeypairCommand } from './commands/keypair.js';
import { createRegisterCommand } from './commands/register.js';
import { createDepositCommand } from './commands/deposit.js';
import { createBalanceCommand } from './commands/balance.js';
import { createQueueBalanceCommand } from './commands/queue-balance.js';
import { createPrivateBalanceCommand } from './commands/private-balance.js';
import { createWithdrawCommand } from './commands/withdraw.js';
import { createTransferCommand, createMergeCommand } from './commands/transfer.js';
import { createStatusCommand } from './commands/status.js';

// Load environment variables
loadEnv();

const program = new Command();

program
  .name('veil')
  .description('CLI for Veil Cash privacy pools on Base')
  .version('0.1.0');

// Add commands
program.addCommand(createInitCommand());
program.addCommand(createKeypairCommand());
program.addCommand(createRegisterCommand());
program.addCommand(createDepositCommand());
program.addCommand(createBalanceCommand());
program.addCommand(createQueueBalanceCommand());
program.addCommand(createPrivateBalanceCommand());
program.addCommand(createWithdrawCommand());
program.addCommand(createTransferCommand());
program.addCommand(createMergeCommand());
program.addCommand(createStatusCommand());

// Parse and execute
program.parse();
