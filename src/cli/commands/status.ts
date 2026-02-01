/**
 * Status CLI command - Check configuration and service status
 */

import { Command } from 'commander';
import { isRegistered, getAddress } from '../wallet.js';
import { checkRelayHealth } from '../../relay.js';

interface StatusResult {
  walletKey: {
    found: boolean;
    address?: string;
  };
  veilKey: {
    found: boolean;
  };
  depositKey: {
    found: boolean;
    key?: string;
  };
  rpcUrl: {
    found: boolean;
    url: string;
  };
  registration: {
    checked: boolean;
    registered?: boolean;
    matches?: boolean;
    onChainKey?: string | null;
    error?: string;
  };
  relay: {
    checked: boolean;
    healthy?: boolean;
    status?: string;
    network?: string;
    error?: string;
  };
}

export function createStatusCommand(): Command {
  const status = new Command('status')
    .description('Check configuration and service status')
    .option('--rpc-url <url>', 'RPC URL (or set RPC_URL env)')
    .action(async (options) => {
      const result: StatusResult = {
        walletKey: { found: false },
        veilKey: { found: false },
        depositKey: { found: false },
        rpcUrl: { found: false, url: 'https://mainnet.base.org' },
        registration: { checked: false },
        relay: { checked: false },
      };

      // Check WALLET_KEY
      const walletKey = process.env.WALLET_KEY;
      if (walletKey) {
        result.walletKey.found = true;
        try {
          result.walletKey.address = getAddress(walletKey as `0x${string}`);
        } catch {
          // Invalid key format, but it was found
        }
      }

      // Check VEIL_KEY
      const veilKey = process.env.VEIL_KEY;
      if (veilKey) {
        result.veilKey.found = true;
      }

      // Check DEPOSIT_KEY
      const depositKey = process.env.DEPOSIT_KEY;
      if (depositKey) {
        result.depositKey.found = true;
        // Show truncated key
        if (depositKey.length > 20) {
          result.depositKey.key = `${depositKey.slice(0, 10)}...${depositKey.slice(-8)}`;
        } else {
          result.depositKey.key = depositKey;
        }
      }

      // Check RPC_URL
      const rpcUrl = options.rpcUrl || process.env.RPC_URL;
      if (rpcUrl) {
        result.rpcUrl.found = true;
        result.rpcUrl.url = rpcUrl;
      }
      const effectiveRpcUrl = rpcUrl || 'https://mainnet.base.org';

      // Check registration status (requires wallet address)
      if (result.walletKey.found && result.walletKey.address) {
        result.registration.checked = true;
        try {
          const regStatus = await isRegistered(
            result.walletKey.address as `0x${string}`,
            effectiveRpcUrl
          );
          result.registration.registered = regStatus.registered;
          result.registration.onChainKey = regStatus.depositKey;

          // Check if on-chain key matches env DEPOSIT_KEY
          if (regStatus.registered && depositKey && regStatus.depositKey) {
            result.registration.matches = 
              regStatus.depositKey.toLowerCase() === depositKey.toLowerCase();
          }
        } catch (error) {
          result.registration.error = error instanceof Error ? error.message : 'Unknown error';
        }
      }

      // Check relay health
      result.relay.checked = true;
      try {
        const health = await checkRelayHealth();
        result.relay.healthy = health.status === 'ok';
        result.relay.status = health.status;
        result.relay.network = health.network;
      } catch (error) {
        result.relay.healthy = false;
        result.relay.error = error instanceof Error ? error.message : 'Unknown error';
      }

      console.log(JSON.stringify(result, null, 2));
    });

  return status;
}
