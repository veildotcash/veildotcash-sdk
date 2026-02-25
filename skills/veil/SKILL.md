---
name: veil-sdk
version: 1.0.0
description: >
  Generate Veil Cash keypairs, build unsigned register and deposit transactions,
  and produce signer-compatible payloads on Base. Use when the user or agent
  needs Veil keypair generation, on-chain registration, ETH/USDC deposits,
  or unsigned transaction payloads for external signers.
author: veildotcash
permissions:
  - filesystem:read
  - filesystem:write
  - shell:exec
triggers:
  - command: /veil
  - pattern: veil keypair
  - pattern: veil register
  - pattern: veil deposit
  - pattern: unsigned payload
  - pattern: privacy pool
---

# Veil SDK

SDK and CLI for [Veil Cash](https://veil.cash) privacy pools on Base (chain ID 8453).
Package: `@veil-cash/sdk` on npm. All CLI commands output JSON by default.

## Quick reference

| Action | CLI (agent-friendly) | Programmatic |
|--------|---------------------|--------------|
| Generate keypair | `veil init --json` | `new Keypair()` |
| Derive from wallet | `veil init --sign-message --wallet-key 0x...` | `Keypair.fromWalletKey(key)` |
| Show keypair | `veil keypair` | — |
| Register (unsigned) | `veil register --unsigned --address 0x...` | `buildRegisterTx(depositKey, address)` |
| Deposit ETH (unsigned) | `veil deposit ETH 0.1 --unsigned` | `buildDepositETHTx({ depositKey, amount })` |
| Deposit USDC (unsigned) | `veil deposit USDC 100 --unsigned` | `buildApproveUSDCTx({ amount })` + `buildDepositUSDCTx({ depositKey, amount })` |
| Check balance | `veil balance --pool eth` | `getPrivateBalance(...)` / `getQueueBalance(...)` |
| Check status | `veil status` | — |

---

## 1. Keypair generation

A Veil keypair produces a **private key** (`VEIL_KEY`) and a **deposit key** (`DEPOSIT_KEY`).
The deposit key is registered on-chain; the private key is used for ZK proofs.

### CLI

```bash
# Random keypair — outputs JSON, does not write to disk
veil init --json --no-save

# Random keypair — saves to .env.veil
veil init --json

# Derive from Ethereum wallet (same keypair as frontend login)
veil init --sign-message --wallet-key 0xWALLET_PRIVATE_KEY

# Derive from a pre-computed EIP-191 signature (Bankr, MPC, custodial, etc.)
veil init --signature 0xSIGNATURE
```

`--json` output shape:

```json
{
  "veilKey": "0x...",
  "veilPrivateKey": "0x...",
  "depositKey": "0x...",
  "derivation": "random"
}
```

`veilKey` and `veilPrivateKey` are the same value.

### Programmatic

```typescript
import { Keypair } from '@veil-cash/sdk';

const keypair = new Keypair();               // random
const depositKey = keypair.depositKey();      // register this on-chain
const privkey = keypair.privkey;              // store securely

// Or derive from wallet
const derived = await Keypair.fromWalletKey('0xWALLET_KEY');

// Or from a raw EIP-191 signature
const fromSig = Keypair.fromSignature('0xSIGNATURE');
```

---

## 2. Register (build unsigned tx)

Registration is a one-time on-chain operation that links an address to a deposit key.

### CLI

```bash
# Build unsigned register payload
DEPOSIT_KEY=0x... veil register --unsigned --address 0xOWNER

# Change deposit key (already registered with a different key)
DEPOSIT_KEY=0x... veil register --unsigned --address 0xOWNER --force
```

Output:

```json
{
  "action": "register",
  "to": "0x...",
  "data": "0x...",
  "value": "0",
  "chainId": 8453
}
```

### Programmatic

```typescript
import { buildRegisterTx, buildChangeDepositKeyTx } from '@veil-cash/sdk';

const tx = buildRegisterTx(depositKey, '0xOWNER');
// tx = { to, data }  — no value for register

// To change an existing key:
const changeTx = buildChangeDepositKeyTx(newDepositKey, '0xOWNER');
```

Add `value: '0'` and `chainId: 8453` when forwarding to a signer.

---

## 3. Deposit (build unsigned tx)

Deposits send ETH or USDC into the privacy pool. Minimum: 0.01 ETH / 10 USDC (net after 0.3% fee).

### CLI

```bash
# ETH deposit — single payload
DEPOSIT_KEY=0x... veil deposit ETH 0.1 --unsigned

# USDC deposit — outputs array: [approve, deposit]
DEPOSIT_KEY=0x... veil deposit USDC 100 --unsigned
```

ETH output (single object):

```json
{
  "step": "deposit",
  "to": "0x...",
  "data": "0x...",
  "value": "100000000000000000",
  "chainId": 8453
}
```

USDC output (array — submit in order):

```json
[
  {
    "step": "approve",
    "to": "0x...",
    "data": "0x...",
    "value": "0",
    "chainId": 8453
  },
  {
    "step": "deposit",
    "to": "0x...",
    "data": "0x...",
    "value": "0",
    "chainId": 8453
  }
]
```

### Programmatic

```typescript
import {
  buildDepositETHTx,
  buildDepositUSDCTx,
  buildApproveUSDCTx,
} from '@veil-cash/sdk';

// ETH
const ethTx = buildDepositETHTx({ depositKey, amount: '0.1' });
// ethTx = { to, data, value: 100000000000000000n }

// USDC (two-step: approve then deposit)
const approve = buildApproveUSDCTx({ amount: '100' });
const usdcTx  = buildDepositUSDCTx({ depositKey, amount: '100' });
```

When forwarding programmatic results to a signer, serialize `value` as a **string** (wei) and add `chainId: 8453`.

---

## 4. Unsigned payload format

All `--unsigned` CLI output follows this shape, compatible with any signer that accepts arbitrary transactions:

```json
{
  "to": "0x...",
  "data": "0x...",
  "value": "0",
  "chainId": 8453
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `to` | string | yes | Target contract (0x + 40 hex chars) |
| `data` | string | yes | Encoded calldata (0x + hex) |
| `value` | string | yes | Wei as string (`"0"` or `"100000000000000000"`) |
| `chainId` | number | yes | 8453 (Base mainnet) |

`value` must be a **string**, never a number or bigint.

---

## 5. Submit to signer

The SDK does **not** sign or submit transactions. Hand the unsigned payload to your signer:

1. **External wallet/MPC** — send the payload via your wallet SDK (viem, ethers, etc.)
2. **Bankr / Moltbot** — forward the JSON to Bankr's arbitrary-transaction endpoint
3. **Custodial API** — POST the payload to your custodial signer

After submission, poll the signer or chain for the transaction hash and report the result.

---

## 6. Security

- Store `VEIL_KEY` and `DEPOSIT_KEY` in a secure file (e.g. `.env.veil`), mode `0600`.
- Never commit secrets to source control.
- The deposit key is public (registered on-chain); the private key (`VEIL_KEY`) is secret.
- All on-chain actions should require explicit user confirmation.

---

## 7. Supported assets

| Asset | Decimals | Pool |
|-------|----------|------|
| ETH | 18 | Native ETH (via WETH) |
| USDC | 6 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

---

## Additional resources

For the full payload spec and SDK function signatures, see [reference.md](reference.md).
