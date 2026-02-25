# @veil-cash/sdk

[![npm version](https://img.shields.io/npm/v/@veil-cash/sdk.svg)](https://www.npmjs.com/package/@veil-cash/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@veil-cash/sdk.svg)](https://www.npmjs.com/package/@veil-cash/sdk)
[![license](https://img.shields.io/npm/l/@veil-cash/sdk.svg)](https://github.com/veildotcash/veildotcash-sdk/blob/main/LICENSE)

SDK and CLI for interacting with [Veil Cash](https://veil.cash) privacy pools on Base.

Generate keypairs, register, deposit, withdraw, transfer, and merge ETH and USDC privately.

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

## Supported Assets

| Asset | Decimals | Token Contract |
|-------|----------|---------------|
| ETH | 18 | Native ETH (via WETH) |
| USDC | 6 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

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

# 5. Deposit (ETH or USDC)
veil deposit ETH 0.1
veil deposit USDC 100

# 6. Check your balance
veil balance                  # All pools (default)
veil balance --pool eth       # ETH pool only
veil balance --pool usdc      # USDC pool only

# 7. Withdraw to any address
veil withdraw ETH 0.05 0xRecipientAddress
veil withdraw USDC 50 0xRecipientAddress

# 8. Transfer privately to another registered user
veil transfer ETH 0.02 0xRecipientAddress

# 9. Merge small UTXOs (consolidate balances)
veil merge ETH 0.1
```

## CLI Commands

### `veil init`

Generate or derive a Veil keypair.

```bash
veil init                                  # Random keypair, saves to .env.veil
veil init --force                          # Overwrite existing without prompting
veil init --json                           # Output as JSON (no prompts, no file save)
veil init --no-save                        # Print keypair without saving

# Derive from wallet (same keypair as frontend login)
veil init --sign-message --wallet-key 0x...

# Derive from a pre-computed EIP-191 signature (from Bankr, MPC, etc.)
veil init --signature 0x...
```

`--json` output:
```json
{
  "veilKey": "0x...",
  "veilPrivateKey": "0x...",
  "depositKey": "0x...",
  "derivation": "wallet-signature"
}
```

`veilKey` and `veilPrivateKey` are the same value (the Veil private key). Both are included for backward compatibility -- `veil keypair` uses `veilPrivateKey`. The `derivation` field indicates how the keypair was created: `"wallet-signature"`, `"provided-signature"`, or `"random"`.

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

Register or update your deposit key on-chain.

```bash
veil register                              # Register (first time)
veil register --json                       # JSON output
veil register --unsigned --address 0x...   # Unsigned payload for agents

# Change deposit key (if already registered with a different key)
veil register --force                      # Change to local deposit key
veil register --force --unsigned           # Unsigned change payload for agents
```

If already registered with the same key, the command exits successfully. If registered with a different key (e.g. after `veil init --sign-message`), use `--force` to update it on-chain.

### `veil deposit <asset> <amount>`

Deposit ETH or USDC into the privacy pool. For USDC, the CLI automatically handles ERC20 approval before depositing.

```bash
veil deposit ETH 0.1                    # Deposit ETH
veil deposit USDC 100                   # Approve + deposit USDC
veil deposit ETH 0.1 --unsigned         # Unsigned payload for agents
veil deposit ETH 0.1 --quiet            # Suppress progress output
```

Output:
```json
{
  "success": true,
  "hash": "0x...",
  "asset": "ETH",
  "amount": "0.1",
  "blockNumber": "12345678",
  "gasUsed": "150000"
}
```

### `veil balance`

Show both queue and private balances.

```bash
veil balance                        # All pools (default)
veil balance --pool eth             # ETH pool only
veil balance --pool usdc            # USDC pool only
veil balance --quiet                # Suppress progress output
```

Output:
```json
{
  "address": "0x...",
  "pool": "ETH",
  "symbol": "ETH",
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

### `veil withdraw <asset> <amount> <recipient>`

Withdraw from the privacy pool to any public address.

```bash
veil withdraw ETH 0.05 0xRecipientAddress
veil withdraw USDC 50 0xRecipientAddress
veil withdraw ETH 0.05 0xRecipientAddress --quiet
```

Output:
```json
{
  "success": true,
  "transactionHash": "0x...",
  "blockNumber": 12345678,
  "asset": "ETH",
  "amount": "0.05",
  "recipient": "0x..."
}
```

### `veil transfer <asset> <amount> <recipient>`

Transfer privately to another registered Veil user.

```bash
veil transfer ETH 0.02 0xRecipientAddress
veil transfer USDC 25 0xRecipientAddress
veil transfer ETH 0.02 0xRecipientAddress --quiet
```

Output:
```json
{
  "success": true,
  "transactionHash": "0x...",
  "blockNumber": 12345678,
  "asset": "ETH",
  "amount": "0.02",
  "recipient": "0x...",
  "type": "transfer"
}
```

### `veil merge <asset> <amount>`

Consolidate multiple small UTXOs into one (self-transfer).

```bash
veil merge ETH 0.1                      # Merge ETH UTXOs totaling 0.1 ETH
veil merge USDC 100                     # Merge USDC UTXOs
veil merge ETH 0.1 --quiet
```

Output:
```json
{
  "success": true,
  "transactionHash": "0x...",
  "blockNumber": 12345678,
  "asset": "ETH",
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
import {
  Keypair, buildRegisterTx, buildDepositETHTx,
  buildDepositUSDCTx, buildApproveUSDCTx,
  withdraw, transfer,
} from '@veil-cash/sdk';
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
  amount: '0.1',
});
await client.sendTransaction({ ...depositTx, value: depositTx.value });

// 4b. Deposit USDC (approve first)
const approveTx = buildApproveUSDCTx({ amount: '100' });
await client.sendTransaction(approveTx);
const usdcTx = buildDepositUSDCTx({
  depositKey: keypair.depositKey(),
  amount: '100',
});
await client.sendTransaction(usdcTx);

// 5. Withdraw (sent via relayer, no wallet signing needed)
const withdrawResult = await withdraw({
  amount: '0.05',
  recipient: '0xRecipientAddress',
  keypair,
  pool: 'eth', // 'eth' | 'usdc' (default: 'eth')
});

// 6. Transfer privately
const transferResult = await transfer({
  amount: '0.02',
  recipientAddress: '0xRecipientAddress',
  senderKeypair: keypair,
  pool: 'eth', // 'eth' | 'usdc' (default: 'eth')
});
```

## SDK API Reference

### Keypair

```typescript
import { Keypair, VEIL_SIGNED_MESSAGE } from '@veil-cash/sdk';
import type { MessageSigner } from '@veil-cash/sdk';

// Generate random keypair
const keypair = new Keypair();

// Restore from saved Veil private key
const restored = new Keypair(savedVeilKey);

// Derive from wallet key (same keypair as frontend login)
const derived = await Keypair.fromWalletKey('0xYOUR_WALLET_KEY');

// Derive from a raw EIP-191 signature
const fromSig = Keypair.fromSignature('0xSIGNATURE...');

// Derive from any external signer (Bankr, MPC, custodial, etc.)
const fromSigner = await Keypair.fromSigner(async (message) => {
  // Sign `message` using any personal_sign provider and return the signature
  return await mySigningService.personalSign(message);
});

// Get deposit key (for registration)
keypair.depositKey(); // '0x...' (130 hex chars)

// Veil private key (store securely!)
keypair.privkey; // '0x...'
```

### Transaction Builders

```typescript
import {
  buildRegisterTx, buildChangeDepositKeyTx, buildDepositETHTx, buildDepositTx,
  buildDepositUSDCTx, buildApproveUSDCTx,
} from '@veil-cash/sdk';

// Register deposit key (first time)
const registerTx = buildRegisterTx(depositKey, ownerAddress);
// → { to: '0x...', data: '0x...' }

// Change deposit key (must already be registered)
const changeTx = buildChangeDepositKeyTx(newDepositKey, ownerAddress);
// → { to: '0x...', data: '0x...' }

// Deposit ETH
const depositTx = buildDepositETHTx({
  depositKey: keypair.depositKey(),
  amount: '0.1',
});
// → { to: '0x...', data: '0x...', value: 100000000000000000n }

// Deposit USDC (approve + deposit)
const approveUsdcTx = buildApproveUSDCTx({ amount: '100' });
const depositUsdcTx = buildDepositUSDCTx({
  depositKey: keypair.depositKey(),
  amount: '100',
});

// Generic builder (routes by token)
const tx = buildDepositTx({
  depositKey: keypair.depositKey(),
  amount: '0.1',
  token: 'ETH', // 'ETH' | 'USDC'
});
```

### Withdraw & Transfer

All withdraw, transfer, and merge functions accept an optional `pool` parameter (`'eth'` | `'usdc'`), defaulting to `'eth'`.

```typescript
import { withdraw, transfer, mergeUtxos } from '@veil-cash/sdk';

// Withdraw ETH to public address
const withdrawResult = await withdraw({
  amount: '0.05',
  recipient: '0xRecipientAddress',
  keypair,
  pool: 'eth', // default
  onProgress: (stage, detail) => console.log(stage, detail),
});

// Withdraw USDC
const withdrawUsdc = await withdraw({
  amount: '50',
  recipient: '0xRecipientAddress',
  keypair,
  pool: 'usdc',
});

// Merge UTXOs (consolidate small balances)
const mergeResult = await mergeUtxos({
  amount: '0.1',
  keypair,
  pool: 'eth',
});
```

### Balance Queries

Balance functions accept an optional `pool` parameter (`'eth'` | `'usdc'`), defaulting to `'eth'`.

```typescript
import { getQueueBalance, getPrivateBalance } from '@veil-cash/sdk';

// Check ETH queue balance (pending deposits)
const queueBalance = await getQueueBalance({
  address: '0x...',
  pool: 'eth', // default
});

// Check USDC private balance (requires keypair)
const privateBalance = await getPrivateBalance({
  keypair,
  pool: 'usdc',
});

```

### Addresses

```typescript
import { getAddresses, getPoolAddress, getQueueAddress } from '@veil-cash/sdk';

const addresses = getAddresses();
console.log(addresses.entry);     // Entry contract
console.log(addresses.ethPool);   // ETH pool
console.log(addresses.usdcPool);  // USDC pool

// Helper functions to resolve by pool name
console.log(getPoolAddress('eth'));   // ETH pool address
console.log(getPoolAddress('usdc')); // USDC pool address
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
veil deposit USDC 100 --unsigned    # Outputs approve + deposit payloads

# Suppress progress output for clean JSON
veil balance --quiet
veil balance --pool usdc --quiet
veil withdraw ETH 0.05 0xRecipient --quiet
```

### Bankr Integration

#### Keypair Derivation via Bankr Sign API

Use `Keypair.fromSigner()` with Bankr's `POST /agent/sign` endpoint to derive the same keypair as the frontend:

```typescript
import { Keypair } from '@veil-cash/sdk';

const keypair = await Keypair.fromSigner(async (message) => {
  const res = await fetch('https://api.bankr.bot/agent/sign', {
    method: 'POST',
    headers: { 'X-API-Key': BANKR_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ signatureType: 'personal_sign', message }),
  });
  return (await res.json()).signature;
});
```

Or via CLI (two-step):
```bash
# 1. Get signature from Bankr sign API
SIG=$(curl -s -X POST "https://api.bankr.bot/agent/sign" \
  -H "X-API-Key: $BANKR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"signatureType\":\"personal_sign\",\"message\":\"$(node -e "const{VEIL_SIGNED_MESSAGE}=require('@veil-cash/sdk');console.log(VEIL_SIGNED_MESSAGE)")\"}" \
  | jq -r '.signature')

# 2. Derive keypair from signature
veil init --signature $SIG
```

#### Unsigned Transaction Payloads

Use `--unsigned` to get Bankr-compatible transaction payloads:

```bash
veil deposit ETH 0.1 --unsigned
# {"to":"0x...","data":"0x...","value":"100000000000000000","chainId":8453}
```

The `--unsigned` flag outputs the [Bankr arbitrary transaction format](https://github.com/BankrBot/moltbot-skills/blob/main/bankr/references/arbitrary-transaction.md).

### Programmatic SDK Usage

```typescript
import { Keypair, buildDepositETHTx, buildDepositTx, withdraw } from '@veil-cash/sdk';

// For deposits: build transaction, let agent sign via Bankr
const keypair = new Keypair(veilKey);
const tx = buildDepositETHTx({
  depositKey: keypair.depositKey(),
  amount: '0.1',
});
// → { to, data, value } - pass to Bankr for signing

// Generic builder works for any asset
const usdcTx = buildDepositTx({
  depositKey: keypair.depositKey(),
  amount: '100',
  token: 'USDC',
});

// For withdrawals: SDK handles ZK proofs, submits to relayer
const result = await withdraw({
  amount: '0.05',
  recipient: '0xRecipient',
  keypair,
  pool: 'eth', // 'eth' | 'usdc'
});
// → { success, transactionHash, blockNumber }
```

## Deposit Flow

1. **Generate Keypair**: Run `veil init` to create and save your Veil keypair
2. **Register**: Run `veil register` to link your deposit key on-chain (one-time)
3. **Check Status**: Run `veil status` to verify your setup
4. **Deposit**: Run `veil deposit <asset> <amount>` (e.g., `veil deposit ETH 0.1`, `veil deposit USDC 100`)
5. **Wait**: The Veil deposit engine processes your deposit
6. **Done**: Your deposit is accepted into the privacy pool

## Withdrawal Flow

1. **Check Balance**: Run `veil balance --pool <pool>` to see your private balance
2. **Withdraw**: Run `veil withdraw <asset> <amount> <recipient>`
3. **Done**: The SDK builds ZK proofs and submits via the relayer

## License

MIT
