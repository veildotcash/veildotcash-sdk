/**
 * Status CLI command - Check configuration and service status
 */

import { Command } from 'commander';
import { isRegistered, getAddress, getWalletBalances } from '../wallet.js';
import { checkRelayHealth } from '../../relay.js';
import { maskValue, printFields, printHeader, printJson, printSection } from '../output.js';

interface StatusResult {
  walletKey: {
    found: boolean;
    address?: string;
    valid?: boolean;
    ethBalance?: string;
    error?: string;
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
    .option('--relay-url <url>', 'Relay URL (or set RELAY_URL env)')
    .option('--json', 'Output as JSON')
    .addHelpText('after', `
Examples:
  veil status
  veil status --relay-url https://relay.example
  veil status --json
`)
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
          result.walletKey.valid = true;
        } catch {
          result.walletKey.valid = false;
          result.walletKey.error = 'invalid format';
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
        try {
          const walletBalances = await getWalletBalances(
            result.walletKey.address as `0x${string}`,
            effectiveRpcUrl
          );
          result.walletKey.ethBalance = walletBalances.eth;
        } catch {
          // Ignore wallet balance lookup errors so status can still report config/registration
        }

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
      const relayUrl = options.relayUrl || process.env.RELAY_URL;
      result.relay.checked = true;
      try {
        const health = await checkRelayHealth(relayUrl);
        result.relay.healthy = health.status === 'ok';
        result.relay.status = health.status;
        result.relay.network = health.network;
      } catch (error) {
        result.relay.healthy = false;
        result.relay.error = error instanceof Error ? error.message : 'Unknown error';
      }

      if (options.json) {
        printJson(result);
        return;
      }

      printHeader('Veil CLI Status');
      printSection('Configuration');
      printFields([
        {
          label: 'Wallet key',
          value: !result.walletKey.found
            ? 'missing'
            : result.walletKey.valid === false
              ? 'invalid'
              : 'configured'
        },
        { label: 'Wallet address', value: result.walletKey.address || 'n/a' },
        { label: 'ETH balance', value: result.walletKey.ethBalance ? `${result.walletKey.ethBalance} ETH` : 'n/a' },
        { label: 'Veil key', value: result.veilKey.found ? 'configured' : 'missing' },
        { label: 'Deposit key', value: result.depositKey.found ? maskValue(result.depositKey.key || '') : 'missing' },
        { label: 'RPC URL', value: maskUrl(result.rpcUrl.url) },
      ]);

      printSection('Registration');
      if (!result.registration.checked) {
        printFields([
          {
            label: 'Status',
            value: result.walletKey.found
              ? 'skipped (invalid WALLET_KEY)'
              : 'skipped (no WALLET_KEY)'
          },
        ]);
      } else if (result.registration.error) {
        printFields([
          { label: 'Error', value: result.registration.error },
        ]);
      } else {
        printFields([
          { label: 'Registered', value: result.registration.registered },
          { label: 'Keys match', value: result.registration.matches ?? 'n/a' },
          { label: 'On-chain key', value: result.registration.onChainKey ? maskValue(result.registration.onChainKey) : 'n/a' },
        ]);
      }

      printSection('Relay');
      if (result.relay.error) {
        printFields([
          { label: 'Healthy', value: false },
          { label: 'Error', value: result.relay.error },
        ]);
      } else {
        printFields([
          { label: 'Healthy', value: result.relay.healthy },
          { label: 'Status', value: result.relay.status || 'n/a' },
          { label: 'Network', value: result.relay.network || 'n/a' },
        ]);
      }
    });

  return status;
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return maskValue(url);
  }
}
