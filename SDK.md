# SDK Guide

This package ships both a CLI and a TypeScript SDK.

If you are looking for the CLI first-run flow, go back to the main [README](./README.md).

## SDK Quick Start

```typescript
import {
  Keypair, buildRegisterTx, buildDepositETHTx,
  buildDepositUSDCTx, buildApproveUSDCTx,
  withdraw, transfer, getSubaccountStatus, mergeSubaccount,
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

// 7. Inspect a deterministic subaccount slot
const subaccount = await getSubaccountStatus({
  rootPrivateKey: keypair.privkey as `0x${string}`,
  slot: 0,
});
console.log(subaccount.slot.forwarderAddress);

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

// Derive from any external signer (agent framework, MPC, custodial, etc.)
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

> **Daily free deposits**: Each address gets a configurable number of fee-free
> deposits per UTC day. The CLI handles this automatically. If you use the
> builders programmatically, call `getDailyFreeRemaining()` first — when the
> user has free slots, pass the net amount directly (no fee markup needed).

```typescript
import {
  buildRegisterTx, buildChangeDepositKeyTx, buildDepositETHTx, buildDepositTx,
  buildDepositUSDCTx, buildApproveUSDCTx,
} from '@veil-cash/sdk';

// Register deposit key (first time)
const registerTx = buildRegisterTx(depositKey, ownerAddress);
// -> { to: '0x...', data: '0x...' }

// Change deposit key (must already be registered)
const changeTx = buildChangeDepositKeyTx(newDepositKey, ownerAddress);
// -> { to: '0x...', data: '0x...' }

// Deposit ETH
const depositTx = buildDepositETHTx({
  depositKey: keypair.depositKey(),
  amount: '0.1',
});
// -> { to: '0x...', data: '0x...', value: 100000000000000000n }

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

### Browser Proof Generation

`withdraw()`, `transfer()`, `mergeUtxos()`, `mergeSubaccount()`, `buildWithdrawProof()`,
`buildTransferProof()`, and `prepareTransaction()` can generate proofs in browser
runtimes.

In Node, the SDK uses the packaged `keys/` directory by default. In browsers,
the SDK defaults to same-origin hosted proving keys:

```text
/keys/transaction2.wasm
/keys/transaction2.zkey
/keys/transaction16.wasm
/keys/transaction16.zkey
```

For most web apps, copy the SDK `keys/` files into your app's public assets
directory. For example, in Next.js/Vite, serving them from `public/keys` makes
the default path work.

If you host keys elsewhere, pass `provingKeyPath`:

```typescript
await withdraw({
  amount: '0.05',
  recipient: '0xRecipientAddress',
  keypair,
  provingKeyPath: 'https://cdn.example.com/veil-keys',
});

await transfer({
  amount: '0.02',
  recipientAddress: '0xRecipientAddress',
  senderKeypair: keypair,
  provingKeyPath: (circuitName) => `/static/zk/${circuitName}`,
});
```

`provingKeyPath` may be a directory/base URL (`/keys`) or a resolver returning
the circuit base path without the `.wasm` / `.zkey` extension.

This removes Node `fs` key lookup from the browser proof path. Some bundlers
may still require standard Node-core polyfills for existing legacy dependencies
such as `circomlib`, `eth-sig-util`, and `fixed-merkle-tree`.

### Balance Queries

Balance functions accept an optional `pool` parameter (`'eth'` | `'usdc'`), defaulting to `'eth'`.

```typescript
import { getQueueBalance, getPrivateBalance, getDailyFreeRemaining } from '@veil-cash/sdk';

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

// Check how many fee-free deposits the user has left today
const freeRemaining = await getDailyFreeRemaining({
  address: '0x...',
  pool: 'eth', // default
});
// freeRemaining: number — 0 when all free slots are used or the feature is disabled
```

### Subaccounts

Subaccounts are deterministic child slots derived from your main Veil key:

`root key -> slot -> child key -> child deposit key -> forwarder`

Base mainnet only. Status shows the child slot's forwarder wallet balances, private pool balances, and queue state. Deploy and sweep are relay-backed. Merge transfers the subaccount's private pool balance back to the main wallet via a ZK proof. Recovery signs a forwarder withdraw request with the child key and returns a direct transaction for your gas payer to submit.

```typescript
import {
  deriveSubaccountSlot,
  getSubaccountPrivateBalance,
  getSubaccountStatus,
  deploySubaccountForwarder,
  sweepSubaccountForwarder,
  mergeSubaccount,
  buildSubaccountRecoveryTx,
} from '@veil-cash/sdk';

const slot = await deriveSubaccountSlot({
  rootPrivateKey: veilKey,
  slot: 0,
});

const status = await getSubaccountStatus({
  rootPrivateKey: veilKey,
  slot: 0,
});
// status.privateBalances.eth.privateBalance, status.privateBalances.usdc.privateBalance

const privateBalance = await getSubaccountPrivateBalance({
  rootPrivateKey: veilKey,
  slot: 0,
  pool: 'eth',
});
// privateBalance.privateBalance, privateBalance.unspentCount

await deploySubaccountForwarder({
  rootPrivateKey: veilKey,
  slot: 0,
});

await sweepSubaccountForwarder({
  forwarderAddress: slot.forwarderAddress,
  asset: 'eth',
});

// Merge subaccount's private pool balance back to the main wallet
const mergeResult = await mergeSubaccount({
  rootPrivateKey: veilKey,
  slot: 0,
  pool: 'eth', // 'eth' | 'usdc' (default: 'eth')
});
// mergeResult.amount, mergeResult.transactionHash

const recovery = await buildSubaccountRecoveryTx({
  rootPrivateKey: veilKey,
  slot: 0,
  asset: 'usdc',
  to: '0xRecipientAddress',
  amount: '25',
});
// Send recovery.transaction with your wallet client
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

This SDK is designed to work with AI agent frameworks and external signers.

### Non-Interactive CLI

Human-readable output is the CLI default. Use `--json` for machine-readable responses and `--unsigned` for transaction payload generation:

```bash
# Generate keypair as JSON (no prompts, no file save)
veil init --json

# Get unsigned transaction payloads for agent signing
SIGNER_ADDRESS=0x... veil register --unsigned
SIGNER_ADDRESS=0x... veil deposit ETH 0.1 --unsigned
veil deposit USDC 100 --unsigned --address 0x...    # Outputs approve + deposit payloads

# Request machine-readable status or balances
veil balance --json
veil balance --pool usdc --json
veil withdraw ETH 0.05 0xRecipient --json
```

`SIGNER_ADDRESS` can be used for address-only agent flows such as `veil status`, `veil balance`, and `veil register --unsigned` when the signer manages the wallet externally. `WALLET_KEY` and `SIGNER_ADDRESS` are mutually exclusive, and signed commands still require `WALLET_KEY`.

`veil status` shows a **Signing** row that reflects the active mode (`local (WALLET_KEY)`, `external (SIGNER_ADDRESS)`, or `not configured`), plus public ETH balance when it can be resolved.

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

Use `--unsigned` to get signer-compatible transaction payloads:

```bash
SIGNER_ADDRESS=0x... veil register --unsigned
SIGNER_ADDRESS=0x... veil register --unsigned --force
SIGNER_ADDRESS=0x... veil deposit ETH 0.1 --unsigned
veil deposit ETH 0.1 --unsigned --address 0x...
# {"to":"0x...","data":"0x...","value":"100000000000000000","chainId":8453}
```

The `--unsigned` flag outputs a standard `{to, data, value, chainId}` payload compatible with any signer that accepts arbitrary transactions.
When `SIGNER_ADDRESS` is set, `veil register --unsigned` and `veil deposit --unsigned` no longer require the `--address` flag.
For `veil register --unsigned --force`, the CLI checks on-chain registration state first and emits `changeDepositKey` only when the address is already registered; otherwise it falls back to `register`.

### Programmatic SDK Usage

```typescript
import { Keypair, buildDepositETHTx, buildDepositTx, withdraw } from '@veil-cash/sdk';

// For deposits: build transaction, let agent sign via your signer
const keypair = new Keypair(veilKey);
const tx = buildDepositETHTx({
  depositKey: keypair.depositKey(),
  amount: '0.1',
});
// -> { to, data, value } - pass to your signer

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
// -> { success, transactionHash, blockNumber }
```
