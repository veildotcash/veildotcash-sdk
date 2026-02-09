/**
 * Contract addresses for Veil on Base
 */

import type { NetworkAddresses, RelayPool } from './types.js';

/**
 * Contract addresses for Base mainnet
 */
export const ADDRESSES: NetworkAddresses = {
  entry: '0xc2535c547B64b997A4BD9202E1663deaF11c78a5',
  ethPool: '0x293dCda114533FF8f477271c5cA517209FFDEEe7',
  ethQueue: '0xA4a926A2E7a22c38e8DFC6744A61a6aA8b06B230',
  usdcPool: '0x5c50d58E49C59d112680c187De2Bf989d2a91242',
  usdcQueue: '0x5530241b24504bF05C9a22e95A1F5458888e6a9B',
  usdcToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  cbbtcPool: '0x51A021da774b4bBB59B47f7CB4ccd631337680BA',
  cbbtcQueue: '0x977741CaDF8D1431c4816C0993D32b02094cD35C',
  cbbtcToken: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
  chainId: 8453,
  relayUrl: 'https://veil-relay.up.railway.app',
} as const;

/**
 * Pool configuration (decimals, symbols, etc.)
 */
export const POOL_CONFIG = {
  eth: {
    decimals: 18,
    displayDecimals: 4,
    symbol: 'ETH',
    name: 'Ethereum',
  },
  usdc: {
    decimals: 6,
    displayDecimals: 2,
    symbol: 'USDC',
    name: 'USD Coin',
  },
  cbbtc: {
    decimals: 8,
    displayDecimals: 6,
    symbol: 'cbBTC',
    name: 'Coinbase Bitcoin',
  },
} as const;

/**
 * Get contract addresses
 * @returns Contract addresses for Base mainnet
 */
export function getAddresses(): NetworkAddresses {
  return ADDRESSES;
}

/**
 * Get the pool contract address for a given pool
 * @param pool - Pool identifier ('eth', 'usdc', or 'cbbtc')
 * @returns Pool contract address
 */
export function getPoolAddress(pool: RelayPool): `0x${string}` {
  const addresses = getAddresses();
  switch (pool) {
    case 'eth': return addresses.ethPool;
    case 'usdc': return addresses.usdcPool;
    case 'cbbtc': return addresses.cbbtcPool;
    default: throw new Error(`Unknown pool: ${pool}`);
  }
}

/**
 * Get the queue contract address for a given pool
 * @param pool - Pool identifier ('eth', 'usdc', or 'cbbtc')
 * @returns Queue contract address
 */
export function getQueueAddress(pool: RelayPool): `0x${string}` {
  const addresses = getAddresses();
  switch (pool) {
    case 'eth': return addresses.ethQueue;
    case 'usdc': return addresses.usdcQueue;
    case 'cbbtc': return addresses.cbbtcQueue;
    default: throw new Error(`Unknown pool: ${pool}`);
  }
}

/**
 * Get Relay URL
 * @returns Relay URL for Base mainnet
 */
export function getRelayUrl(): string {
  return ADDRESSES.relayUrl;
}
