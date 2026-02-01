# @veil-cash/sdk

[![npm version](https://img.shields.io/npm/v/@veil-cash/sdk.svg)](https://www.npmjs.com/package/@veil-cash/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@veil-cash/sdk.svg)](https://www.npmjs.com/package/@veil-cash/sdk)
[![license](https://img.shields.io/npm/l/@veil-cash/sdk.svg)](https://github.com/veildotcash/veildotcash-sdk/blob/main/LICENSE)

SDK and CLI for interacting with [Veil Cash](https://veil.cash) privacy pools on Base.

Generate keypairs, register, deposit, withdraw, transfer, and merge ETH privately.

## Installation

```bash
npm install @veil-cash/sdk
# or
yarn add @veil-cash/sdk
# or
pnpm add @veil-cash/sdk
```

For global CLI access:
```bash
npm install -g @veil-cash/sdk
```

## CLI Quick Start

```bash
# 1. Generate and save your Veil keypair
veil init

# 2. Set your Ethereum wallet key (for signing transactions)
export WALLET_KEY=0x...

# 3. Register your deposit key (one-time)
veil register

# 4. Check your setup
veil status

# 5. Deposit ETH
veil deposit ETH 0.1

# 6. Check your balance
veil balance

# 7. Withdraw to any address
veil withdraw ETH 0.05 0xRecipientAddress

# 8. Transfer privately to another registered user
veil transfer ETH 0.02 0xRecipientAddress

# 9. Merge small UTXOs (consolidate balances)
veil merge ETH 0.1
```

## CLI Commands

### `veil init`

Generate a new Veil keypair.

```bash
veil init              # Interactive, saves to .env.veil
veil init --force      # Overwrite existing without prompting
veil init --json       # Output as JSON (no prompts, no file save)
veil init --out path   # Save to custom path
veil init --no-save    # Print keypair without saving
```

### `veil keypair`

Show current Veil keypair as JSON (from VEIL_KEY env).

```bash
veil keypair
# {"veilPrivateKey":"0x...","depositKey":"0x..."}
```

### `veil status`

Check configuration and service status.

```bash
veil status
```

Output:
```json
{
  "walletKey": { "found": true, "address": "0x..." },
  "veilKey": { "found": true },
  "depositKey": { "found": true, "key": "0x1234...abcd" },
  "rpcUrl": { "found": false, "url": "https://mainnet.base.org" },
  "registration": {
    "checked": true,
    "registered": true,
    "matches": true,
    "onChainKey": "0x..."
  },
  "relay": {
    "checked": true,
    "healthy": true,
    "status": "ok",
    "network": "mainnet"
  }
}
```

### `veil register`

Register your deposit key on-chain (one-time per address).

```bash
veil register                              # Signs & sends
veil register --json                       # JSON output
veil register --unsigned --address 0x...   # Unsigned payload for agents
```

### `veil deposit ETH <amount>`

Deposit ETH into the privacy pool.

```bash
veil deposit ETH 0.1                    # Signs & sends (JSON output)
veil deposit ETH 0.1 --unsigned         # Unsigned payload for agents
veil deposit ETH 0.1 --quiet            # Suppress progress output
```

Output:
```json
{
  "success": true,
  "hash": "0x...",
  "amount": "0.1",
  "blockNumber": "12345678",
  "gasUsed": "150000"
}
```

### `veil balance`

Show both queue and private balances.

```bash
veil balance                        # Show all balances
veil balance --quiet                # Suppress progress output
```

Output:
```json
{
  "address": "0x...",
  "depositKey": "0x...",
  "totalBalance": "0.15",
  "totalBalanceWei": "150000000000000000",
  "private": {
    "balance": "0.10",
    "balanceWei": "100000000000000000",
    "utxoCount": 2,
    "utxos": [
      { "index": 5, "amount": "0.05" },
      { "index": 8, "amount": "0.05" }
    ]
  },
  "queue": {
    "balance": "0.05",
    "balanceWei": "50000000000000000",
    "count": 1,
    "deposits": [
      { "nonce": 42, "amount": "0.05", "status": "pending" }
    ]
  }
}
```

### `veil withdraw ETH <amount> <recipient>`

Withdraw from the privacy pool to any public address.

```bash
veil withdraw ETH 0.05 0xRecipientAddress
veil withdraw ETH 0.05 0xRecipientAddress --quiet
```

Output:
```json
{
  "success": true,
  "transactionHash": "0x...",
  "blockNumber": 12345678,
  "amount": "0.05",
  "recipient": "0x...",
  "type": "withdraw"
}
```

### `veil transfer ETH <amount> <recipient>`

Transfer privately to another registered Veil user.

```bash
veil transfer ETH 0.02 0xRecipientAddress
veil transfer ETH 0.02 0xRecipientAddress --quiet
```

Output:
```json
{
  "success": true,
  "transactionHash": "0x...",
  "blockNumber": 12345678,
  "amount": "0.02",
  "recipient": "0x...",
  "type": "transfer"
}
```

### `veil merge ETH <amount>`

Consolidate multiple small UTXOs into one (self-transfer).

```bash
veil merge ETH 0.1                      # Merge UTXOs totaling 0.1 ETH
veil merge ETH 0.1 --quiet
```

Output:
```json
{
  "success": true,
  "transactionHash": "0x...",
  "blockNumber": 12345678,
  "amount": "0.1",
  "type": "merge"
}
```

## Environment Variables

The CLI uses two config files:

| File | Purpose |
|------|---------|
| `.env.veil` | Veil keypair (VEIL_KEY, DEPOSIT_KEY) - created by `veil init` |
| `.env` | Wallet config (WALLET_KEY, RPC_URL) - your existing config |

### Variables

| Variable | Description |
|----------|-------------|
| `VEIL_KEY` | Your Veil private key (for ZK proofs, withdrawals, transfers) |
| `DEPOSIT_KEY` | Your Veil deposit key (public, for register/deposit) |
| `WALLET_KEY` | Ethereum wallet private key (for signing transactions) |
| `RPC_URL` | Base RPC URL (optional, defaults to public RPC) |

## Error Handling

All CLI commands output JSON with standardized error codes:

```json
{
  "success": false,
  "errorCode": "VEIL_KEY_MISSING",
  "error": "VEIL_KEY required. Use --veil-key or set VEIL_KEY env"
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `VEIL_KEY_MISSING` | VEIL_KEY not provided |
| `WALLET_KEY_MISSING` | WALLET_KEY not provided |
| `DEPOSIT_KEY_MISSING` | DEPOSIT_KEY not provided |
| `INVALID_ADDRESS` | Invalid Ethereum address format |
| `INVALID_AMOUNT` | Invalid or below minimum amount |
| `INSUFFICIENT_BALANCE` | Not enough ETH balance |
| `USER_NOT_REGISTERED` | Recipient not registered in Veil |
| `NO_UTXOS` | No unspent UTXOs available |
| `RELAY_ERROR` | Error from relayer service |
| `RPC_ERROR` | RPC/network error |
| `CONTRACT_ERROR` | Smart contract reverted |
| `UNKNOWN_ERROR` | Unexpected error |

## SDK Quick Start

```typescript
import { Keypair, buildRegisterTx, buildDepositETHTx, withdraw, transfer } from '@veil-cash/sdk';
import { createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// 1. Generate a Veil keypair (do this once, save securely!)
const keypair = new Keypair();
console.log('Veil Private Key:', keypair.privkey);  // SAVE THIS!
console.log('Deposit Key:', keypair.depositKey());  // Register this on-chain

// 2. Setup your Ethereum wallet
const account = privateKeyToAccount('0x...');
const client = createWalletClient({
  account,
  chain: base,
  transport: http(),
});

// 3. Register your deposit key (one-time)
const registerTx = buildRegisterTx(keypair.depositKey(), account.address);
await client.sendTransaction(registerTx);

// 4. Deposit ETH
const depositTx = buildDepositETHTx({
  depositKey: keypair.depositKey(),
  amount: '0.1', // 0.1 ETH
});
await client.sendTransaction({
  ...depositTx,
  value: depositTx.value,
});

// 5. Withdraw (sent via relayer, no wallet signing needed)
const withdrawResult = await withdraw({
  amount: '0.05',
  recipient: '0xRecipientAddress',
  keypair,
});

// 6. Transfer privately
const transferResult = await transfer({
  amount: '0.02',
  recipientAddress: '0xRecipientAddress',
  senderKeypair: keypair,
});
```

## SDK API Reference

### Keypair

```typescript
import { Keypair } from '@veil-cash/sdk';

// Generate new keypair
const keypair = new Keypair();

// Restore from saved Veil private key
const restored = new Keypair(savedVeilKey);

// Get deposit key (for registration)
keypair.depositKey(); // '0x...' (130 hex chars)

// Veil private key (store securely!)
keypair.privkey; // '0x...'
```

### Transaction Builders

```typescript
import { buildRegisterTx, buildDepositETHTx } from '@veil-cash/sdk';

// Register deposit key (one-time)
const registerTx = buildRegisterTx(depositKey, ownerAddress);
// → { to: '0x...', data: '0x...' }

// Deposit ETH
const depositTx = buildDepositETHTx({
  depositKey: keypair.depositKey(),
  amount: '0.1',
});
// → { to: '0x...', data: '0x...', value: 100000000000000000n }
```

### Withdraw & Transfer

```typescript
import { withdraw, transfer, mergeUtxos } from '@veil-cash/sdk';

// Withdraw to public address
const withdrawResult = await withdraw({
  amount: '0.05',
  recipient: '0xRecipientAddress',
  keypair,
  onProgress: (stage, detail) => console.log(stage, detail),
});

// Transfer to another registered user
const transferResult = await transfer({
  amount: '0.02',
  recipientAddress: '0xRecipientAddress',
  senderKeypair: keypair,
});

// Merge UTXOs (consolidate small balances)
const mergeResult = await mergeUtxos({
  amount: '0.1',
  keypair,
});
```

### Balance Queries

```typescript
import { getQueueBalance, getPrivateBalance } from '@veil-cash/sdk';

// Check queue balance (pending deposits)
const queueBalance = await getQueueBalance({
  address: '0x...',
});

// Check private balance (requires keypair)
const privateBalance = await getPrivateBalance({
  keypair,
});
```

### Addresses

```typescript
import { getAddresses } from '@veil-cash/sdk';

const addresses = getAddresses();
console.log(addresses.entry);     // Entry contract
console.log(addresses.ethPool);   // ETH pool
console.log(addresses.ethQueue);  // ETH queue
```

## For AI Agents

This SDK is designed to work with AI agent frameworks like [Bankr](https://bankr.bot).

### Non-Interactive CLI

All commands output JSON and support non-interactive usage:

```bash
# Generate keypair as JSON (no prompts, no file save)
veil init --json

# Get unsigned transaction payloads for agent signing
veil register --unsigned --address 0x...
veil deposit ETH 0.1 --unsigned

# Suppress progress output for clean JSON
veil balance --quiet
veil withdraw ETH 0.05 0xRecipient --quiet
```

### Bankr Integration

Use `--unsigned` to get Bankr-compatible transaction payloads:

```bash
veil deposit ETH 0.1 --unsigned
# {"to":"0x...","data":"0x...","value":"100000000000000000","chainId":8453}
```

The `--unsigned` flag outputs the [Bankr arbitrary transaction format](https://github.com/BankrBot/moltbot-skills/blob/main/bankr/references/arbitrary-transaction.md).

### Programmatic SDK Usage

```typescript
import { Keypair, buildDepositETHTx, withdraw } from '@veil-cash/sdk';

// For deposits: build transaction, let agent sign via Bankr
const keypair = new Keypair(veilKey);
const tx = buildDepositETHTx({
  depositKey: keypair.depositKey(),
  amount: '0.1',
});
// → { to, data, value } - pass to Bankr for signing

// For withdrawals: SDK handles ZK proofs, submits to relayer
const result = await withdraw({
  amount: '0.05',
  recipient: '0xRecipient',
  keypair,
});
// → { success, transactionHash, blockNumber }
```

## Deposit Flow

1. **Generate Keypair**: Run `veil init` to create and save your Veil keypair
2. **Register**: Run `veil register` to link your deposit key on-chain (one-time)
3. **Check Status**: Run `veil status` to verify your setup
4. **Deposit**: Run `veil deposit ETH <amount>` to send ETH
5. **Wait**: The Veil deposit engine processes your deposit
6. **Done**: Your deposit is accepted into the privacy pool

## Withdrawal Flow

1. **Check Balance**: Run `veil balance` to see your private balance
2. **Withdraw**: Run `veil withdraw ETH <amount> <recipient>`
3. **Done**: The SDK builds ZK proofs and submits via the relayer

## License

MIT
