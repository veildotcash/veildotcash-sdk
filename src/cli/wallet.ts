/**
 * Wallet utilities for CLI transaction signing
 */

import { 
  createWalletClient, 
  createPublicClient,
  http, 
  decodeErrorResult,
  BaseError,
  ContractFunctionRevertedError,
  formatUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import type { TransactionData } from '../types.js';
import { ENTRY_ABI, ERC20_ABI } from '../abi.js';
import { getAddresses, POOL_CONFIG, ADDRESSES } from '../addresses.js';

export interface WalletConfig {
  privateKey: `0x${string}`;
  rpcUrl?: string;
}

export interface SendTransactionResult {
  hash: `0x${string}`;
  receipt: {
    status: 'success' | 'reverted';
    blockNumber: bigint;
    gasUsed: bigint;
  };
}

/**
 * Create a wallet client for signing and sending transactions
 * @returns Wallet and public clients with account and chain
 * 
 * Note: Uses `any` return type to avoid viem's complex generic type mismatches
 * that occur with Base chain's deposit transaction types. Runtime behavior is correct.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createWallet(config: WalletConfig): any {
  const { privateKey, rpcUrl } = config;
  
  const account = privateKeyToAccount(privateKey);
  const chain = base;
  const transport = http(rpcUrl);

  const walletClient = createWalletClient({
    account,
    chain,
    transport,
  });

  const publicClient = createPublicClient({
    chain,
    transport,
  });

  return { walletClient, publicClient, account, chain };
}

/**
 * Known custom error selectors (first 4 bytes of keccak256 hash of error signature)
 */
const ERROR_SELECTORS: Record<string, string> = {
  '0xd92e233d': 'ZeroAddress',
  '0xe9e26e4e': 'OnlyOwnerCanRegister',
  '0x1f2a2005': 'ZeroAmount',
  '0x3ee5aeb5': 'DepositsDisabled',
  '0x4cba3441': 'InvalidDepositKey',
  '0xc64891a5': 'NotRelayer',
  '0xfcc00b30': 'NoETHBalance',
  '0x7b7b36da': 'NoTokenBalance',
  '0x7ffddb78': 'TokenApproveFailed',
  '0xb12d13eb': 'ETHTransferFailed',
  '0x1f6d5aef': 'NonceUsed',
  '0x82b42900': 'Unauthorized',
  '0x1ab7da6b': 'DeadlineExpired',
  '0x8e8f6d6f': 'MinimumDepositNotMet',
  '0x5cd83192': 'NotAllowedToDeposit',
  '0x6f5e8818': 'UserNotRegistered',
  '0x8a2ef116': 'UserAlreadyRegistered',
  '0x0dc149f0': 'InvalidDepositKey',
  '0x584a7938': 'InvalidDepositKeyForUser',
};

/**
 * Try to decode a custom error from the ABI or known selectors
 */
function decodeCustomError(error: unknown): string | null {
  // Convert error to string and look for hex data
  const errorStr = String(error);
  
  // Try to find revert data in the error (look for 0x followed by hex)
  const dataMatch = errorStr.match(/data:\s*(0x[a-fA-F0-9]+)/);
  if (dataMatch) {
    const data = dataMatch[1];
    const selector = data.slice(0, 10).toLowerCase();
    if (ERROR_SELECTORS[selector]) {
      return ERROR_SELECTORS[selector];
    }
  }
  
  if (error instanceof BaseError) {
    // Check if it's a ContractFunctionRevertedError
    const revertError = error.walk(err => err instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError) {
      const errorName = revertError.data?.errorName;
      if (errorName) {
        return errorName;
      }
    }
    
    // Try to extract error data from various places
    const anyError = error as any;
    const possibleData = anyError.data || anyError.cause?.data || anyError.cause?.cause?.data;
    
    if (possibleData && typeof possibleData === 'string' && possibleData.startsWith('0x')) {
      try {
        for (const abi of [ENTRY_ABI] as const) {
          try {
            const decoded = decodeErrorResult({
              abi,
              data: possibleData as `0x${string}`,
            });
            return decoded.errorName;
          } catch {
            // Try the next ABI
          }
        }
      } catch {
        // Try selector lookup
        const selector = possibleData.slice(0, 10).toLowerCase();
        if (ERROR_SELECTORS[selector]) {
          return ERROR_SELECTORS[selector];
        }
      }
    }
  }
  return null;
}

/**
 * Send a transaction and wait for confirmation
 */
export async function sendTransaction(
  config: WalletConfig,
  tx: TransactionData
): Promise<SendTransactionResult> {
  const { walletClient, publicClient, account, chain } = createWallet(config);

  try {
    // Simulate first to get better error messages
    await publicClient.call({
      account,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    });
  } catch (error) {
    // Try to decode custom error
    const customError = decodeCustomError(error);
    if (customError) {
      throw new Error(customError);
    }
    // Re-throw with original message if we can't decode
    throw error;
  }

  // Send the transaction
  let hash: `0x${string}`;
  try {
    hash = await walletClient.sendTransaction({
      account,
      chain,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    });
  } catch (error) {
    throw error;
  }

  // Wait for confirmation
  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash });
  } catch (error) {
    throw error;
  }

  return {
    hash,
    receipt: {
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    },
  };
}

/**
 * Get the address from a private key
 */
export function getAddress(privateKey: `0x${string}`): `0x${string}` {
  const account = privateKeyToAccount(privateKey);
  return account.address;
}

/**
 * Get ETH balance for an address
 */
export async function getBalance(
  address: `0x${string}`,
  rpcUrl?: string
): Promise<bigint> {
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({
    chain: base,
    transport,
  });

  return publicClient.getBalance({ address });
}

/**
 * Get public wallet balances (ETH + USDC) for an address
 */
export async function getWalletBalances(
  address: `0x${string}`,
  rpcUrl?: string
): Promise<{ eth: string; ethWei: string; usdc: string; usdcWei: string }> {
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({
    chain: base,
    transport,
  });

  const [ethBalance, usdcBalance] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.readContract({
      address: ADDRESSES.usdcToken as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    }) as Promise<bigint>,
  ]);

  return {
    eth: formatUnits(ethBalance, POOL_CONFIG.eth.decimals),
    ethWei: ethBalance.toString(),
    usdc: formatUnits(usdcBalance, POOL_CONFIG.usdc.decimals),
    usdcWei: usdcBalance.toString(),
  };
}

/**
 * Check if an address is already registered (has a deposit key on-chain)
 */
export async function isRegistered(
  address: `0x${string}`,
  rpcUrl?: string
): Promise<{ registered: boolean; depositKey: string | null }> {
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({
    chain: base,
    transport,
  });

  const addresses = getAddresses();
  
  const depositKey = await publicClient.readContract({
    address: addresses.entry,
    abi: ENTRY_ABI,
    functionName: 'depositKeys',
    args: [address],
  }) as `0x${string}`;

  // If depositKey has length > 2 (more than just "0x"), user is registered
  const registered = depositKey && depositKey.length > 2;
  
  return {
    registered,
    depositKey: registered ? depositKey : null,
  };
}
