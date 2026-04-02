/**
 * Keypair CLI command - Show current keypair as JSON
 */

import { Command } from 'commander';
import { Keypair } from '../../keypair.js';
import { handleCLIError, CLIError, ErrorCode } from '../errors.js';
import { printFields, printJson, printLine } from '../output.js';

export function createKeypairCommand(): Command {
  const keypair = new Command('keypair')
    .description('Show your current Veil keypair')
    .option('--json', 'Output as JSON')
    .addHelpText('after', `
Examples:
  veil keypair
  veil keypair --json
`)
    .action(() => {
      try {
        const veilKey = process.env.VEIL_KEY;

        if (!veilKey) {
          throw new CLIError(ErrorCode.VEIL_KEY_MISSING, 'No keypair found. Run "veil init" first.');
        }

        const kp = new Keypair(veilKey);
        const result = {
          veilPrivateKey: kp.privkey,
          depositKey: kp.depositKey(),
        };

        if ((keypair.opts() as { json?: boolean }).json) {
          printJson(result);
          return;
        }

        printLine('Veil keypair');
        printFields([
          { label: 'Veil private key', value: result.veilPrivateKey },
          { label: 'Deposit key', value: result.depositKey },
        ]);
      } catch (error) {
        handleCLIError(error);
      }
    });

  return keypair;
}
