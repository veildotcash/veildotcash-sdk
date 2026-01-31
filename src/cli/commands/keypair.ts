/**
 * Keypair CLI command - Show current keypair as JSON
 */

import { Command } from 'commander';
import { Keypair } from '../../keypair.js';

export function createKeypairCommand(): Command {
  const keypair = new Command('keypair')
    .description('Show current Veil keypair as JSON')
    .action(() => {
      const veilKey = process.env.VEIL_KEY;
      
      if (!veilKey) {
        console.log(JSON.stringify({ 
          success: false, 
          error: 'No keypair found. Run "veil init" first.' 
        }, null, 2));
        process.exit(1);
      }
      
      const kp = new Keypair(veilKey);
      
      console.log(JSON.stringify({
        veilPrivateKey: kp.privkey,
        depositKey: kp.depositKey(),
      }, null, 2));
    });

  return keypair;
}
