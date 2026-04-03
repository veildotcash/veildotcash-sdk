/**
 * Status CLI command - Check configuration and service status
 */

import { Command } from 'commander';
import { isRegistered, getAddress, getWalletBalances } from '../wallet.js';
import { resolveAddress } from '../config.js';
import { checkRelayHealth } from '../../relay.js';
import { handleCLIError } from '../errors.js';
import { maskValue, printFields, printHeader, printJson, printSection } from '../output.js';

interface StatusResult {
  walletKey: {
    found: boolean;
    address?: string;
    valid?: boolean;
    ethBalance?: string;
    error?: string;
  };
  signerAddress: {
    found: boolean;
    address?: string;
    valid?: boolean;
  };
  resolvedAddress: {
    address?: string;
    source?: string;
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
    .option('--json', 'Output as JSON')
    .addHelpText('after', `
Examples:
  veil status
  veil status --json
`)
    .action(async (options) => {
      try {
        const result: StatusResult = {
          walletKey: { found: false },
          signerAddress: { found: false },
          resolvedAddress: {},
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

        // Check SIGNER_ADDRESS
        const signerAddress = process.env.SIGNER_ADDRESS;
        if (signerAddress) {
          result.signerAddress.found = true;
          if (/^0x[a-fA-F0-9]{40}$/.test(signerAddress.trim())) {
            result.signerAddress.valid = true;
            result.signerAddress.address = signerAddress.trim();
          } else {
            result.signerAddress.valid = false;
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
          if (depositKey.length > 20) {
            result.depositKey.key = `${depositKey.slice(0, 10)}...${depositKey.slice(-8)}`;
          } else {
            result.depositKey.key = depositKey;
          }
        }

        // Check RPC_URL
        const rpcUrl = process.env.RPC_URL;
        if (rpcUrl) {
          result.rpcUrl.found = true;
          result.rpcUrl.url = rpcUrl;
        }
        const effectiveRpcUrl = rpcUrl || 'https://mainnet.base.org';

        const resolvedAddress = resolveAddress({}, { required: false, allowInvalidWalletKey: true });
        if (resolvedAddress) {
          result.resolvedAddress.address = resolvedAddress.address;
          result.resolvedAddress.source =
            resolvedAddress.source === 'wallet-key'
              ? 'WALLET_KEY'
              : resolvedAddress.source === 'signer-address'
                ? 'SIGNER_ADDRESS'
                : '--address';

          try {
            const walletBalances = await getWalletBalances(
              resolvedAddress.address,
              effectiveRpcUrl
            );
            result.walletKey.ethBalance = walletBalances.eth;
          } catch {
            // Ignore wallet balance lookup errors so status can still report config/registration
          }

          result.registration.checked = true;
          try {
            const regStatus = await isRegistered(
              resolvedAddress.address,
              effectiveRpcUrl
            );
            result.registration.registered = regStatus.registered;
            result.registration.onChainKey = regStatus.depositKey;

            if (regStatus.registered && depositKey && regStatus.depositKey) {
              result.registration.matches =
                regStatus.depositKey.toLowerCase() === depositKey.toLowerCase();
            }
          } catch (error) {
            result.registration.error = error instanceof Error ? error.message : 'Unknown error';
          }
        }

        // Check relay health
        const relayUrl = process.env.RELAY_URL;
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

        const signingValue = result.signerAddress.found
          ? result.signerAddress.valid === false
            ? 'external (SIGNER_ADDRESS invalid)'
            : 'external (SIGNER_ADDRESS)'
          : result.walletKey.found
            ? result.walletKey.valid === false
              ? 'local (WALLET_KEY invalid)'
              : 'local (WALLET_KEY)'
            : 'not configured';

        printHeader('Veil CLI Status');
        printSection('Configuration');
        printFields([
          { label: 'Signing', value: signingValue },
          { label: 'Address', value: result.resolvedAddress.address || 'n/a' },
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
              value: result.walletKey.found && result.walletKey.valid === false
                ? 'skipped (invalid WALLET_KEY)'
                : 'skipped (no WALLET_KEY or SIGNER_ADDRESS)'
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
      } catch (error) {
        handleCLIError(error);
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
