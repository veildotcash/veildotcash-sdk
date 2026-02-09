/**
 * Deposit functions for Veil SDK
 * Build transactions for registration and deposits
 */

import { encodeFunctionData, parseEther, parseUnits } from 'viem';
import { getAddresses, POOL_CONFIG } from './addresses.js';
import { ENTRY_ABI, ERC20_ABI } from './abi.js';
import type { 
  Token, 
  TransactionData, 
} from './types.js';

/**
 * Build a transaction to register a deposit key
 * This is a one-time operation that links your address to your keypair
 * 
 * @param depositKey - Deposit key from Keypair.depositKey()
 * @param ownerAddress - Address that will own this deposit key
 * @returns Transaction data to send
 * 
 * @example
 * ```typescript
 * const keypair = new Keypair();
 * const tx = buildRegisterTx(keypair.depositKey(), '0x...');
 * // Send tx using your wallet (viem, ethers, etc.)
 * ```
 */
export function buildRegisterTx(
  depositKey: string,
  ownerAddress: `0x${string}`
): TransactionData {
  const addresses = getAddresses();
  
  const data = encodeFunctionData({
    abi: ENTRY_ABI,
    functionName: 'register',
    args: [{
      owner: ownerAddress,
      depositKey: depositKey as `0x${string}`,
    }],
  });

  return {
    to: addresses.entry,
    data,
  };
}

/**
 * Build a transaction to change an existing deposit key
 * The caller must already be registered on-chain
 * 
 * @param depositKey - New deposit key from Keypair.depositKey()
 * @param ownerAddress - Address that owns the current deposit key (must be msg.sender)
 * @returns Transaction data to send
 * 
 * @example
 * ```typescript
 * const newKeypair = await Keypair.fromWalletKey('0x...');
 * const tx = buildChangeDepositKeyTx(newKeypair.depositKey(), '0x...');
 * // Send tx using your wallet
 * ```
 */
export function buildChangeDepositKeyTx(
  depositKey: string,
  ownerAddress: `0x${string}`
): TransactionData {
  const addresses = getAddresses();
  
  const data = encodeFunctionData({
    abi: ENTRY_ABI,
    functionName: 'changeDepositKey',
    args: [{
      owner: ownerAddress,
      depositKey: depositKey as `0x${string}`,
    }],
  });

  return {
    to: addresses.entry,
    data,
  };
}

/**
 * Build a transaction to deposit ETH
 * 
 * @param options - Deposit options
 * @param options.depositKey - Deposit key from Keypair.depositKey()
 * @param options.amount - Amount to deposit (human readable, e.g., '0.1')
 * @returns Transaction data including value to send
 * 
 * @example
 * ```typescript
 * const tx = buildDepositETHTx({
 *   depositKey: keypair.depositKey(),
 *   amount: '0.1',
 * });
 * // Send tx with tx.value as the ETH amount
 * ```
 */
export function buildDepositETHTx(options: {
  depositKey: string;
  amount: string;
}): TransactionData {
  const { depositKey, amount } = options;
  const addresses = getAddresses();
  
  const value = parseEther(amount);
  
  const data = encodeFunctionData({
    abi: ENTRY_ABI,
    functionName: 'queueETH',
    args: [depositKey as `0x${string}`],
  });

  return {
    to: addresses.entry,
    data,
    value,
  };
}

/**
 * Build a transaction to approve USDC for deposit
 * Must be called before depositUSDC if allowance is insufficient
 * 
 * @param options - Approval options
 * @param options.amount - Amount to approve (human readable, e.g., '100')
 * @returns Transaction data
 */
export function buildApproveUSDCTx(options: {
  amount: string;
}): TransactionData {
  const { amount } = options;
  const addresses = getAddresses();
  
  const amountWei = parseUnits(amount, POOL_CONFIG.usdc.decimals);
  
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [addresses.entry, amountWei],
  });

  return {
    to: addresses.usdcToken,
    data,
  };
}

/**
 * Build a transaction to deposit USDC
 * Note: You must approve USDC first using buildApproveUSDCTx
 * 
 * @param options - Deposit options
 * @param options.depositKey - Deposit key from Keypair.depositKey()
 * @param options.amount - Amount to deposit (human readable, e.g., '100')
 * @returns Transaction data
 */
export function buildDepositUSDCTx(options: {
  depositKey: string;
  amount: string;
}): TransactionData {
  const { depositKey, amount } = options;
  const addresses = getAddresses();
  
  const amountWei = parseUnits(amount, POOL_CONFIG.usdc.decimals);
  
  const data = encodeFunctionData({
    abi: ENTRY_ABI,
    functionName: 'queueUSDC',
    args: [amountWei, depositKey as `0x${string}`],
  });

  return {
    to: addresses.entry,
    data,
  };
}

/**
 * Build a transaction to approve cbBTC for deposit
 * Must be called before depositCBBTC if allowance is insufficient
 * 
 * @param options - Approval options
 * @param options.amount - Amount to approve (human readable, e.g., '0.5')
 * @returns Transaction data
 */
export function buildApproveCBBTCTx(options: {
  amount: string;
}): TransactionData {
  const { amount } = options;
  const addresses = getAddresses();
  
  const amountWei = parseUnits(amount, POOL_CONFIG.cbbtc.decimals);
  
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [addresses.entry, amountWei],
  });

  return {
    to: addresses.cbbtcToken,
    data,
  };
}

/**
 * Build a transaction to deposit cbBTC
 * Note: You must approve cbBTC first using buildApproveCBBTCTx
 * 
 * @param options - Deposit options
 * @param options.depositKey - Deposit key from Keypair.depositKey()
 * @param options.amount - Amount to deposit (human readable, e.g., '0.5')
 * @returns Transaction data
 */
export function buildDepositCBBTCTx(options: {
  depositKey: string;
  amount: string;
}): TransactionData {
  const { depositKey, amount } = options;
  const addresses = getAddresses();
  
  const amountWei = parseUnits(amount, POOL_CONFIG.cbbtc.decimals);
  
  const data = encodeFunctionData({
    abi: ENTRY_ABI,
    functionName: 'queueBTC',
    args: [amountWei, depositKey as `0x${string}`],
  });

  return {
    to: addresses.entry,
    data,
  };
}

/**
 * Build a deposit transaction (ETH, USDC, or cbBTC)
 * Convenience function that routes to the correct builder
 * 
 * @param options - Deposit options
 * @returns Transaction data
 * 
 * @example
 * ```typescript
 * // ETH deposit
 * const ethTx = buildDepositTx({
 *   depositKey: keypair.depositKey(),
 *   amount: '0.1',
 *   token: 'ETH',
 * });
 * 
 * // USDC deposit (remember to approve first!)
 * const usdcTx = buildDepositTx({
 *   depositKey: keypair.depositKey(),
 *   amount: '100',
 *   token: 'USDC',
 * });
 * 
 * // cbBTC deposit (remember to approve first!)
 * const cbbtcTx = buildDepositTx({
 *   depositKey: keypair.depositKey(),
 *   amount: '0.5',
 *   token: 'CBBTC',
 * });
 * ```
 */
export function buildDepositTx(options: {
  depositKey: string;
  amount: string;
  token?: Token;
}): TransactionData {
  const { token = 'ETH', ...rest } = options;
  
  if (token === 'USDC') {
    return buildDepositUSDCTx(rest);
  }

  if (token === 'CBBTC') {
    return buildDepositCBBTCTx(rest);
  }
  
  return buildDepositETHTx(rest);
}
