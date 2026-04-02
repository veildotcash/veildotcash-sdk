---
name: @veil-cash/sdk
version: 0.5.0
description: >
  SDK and CLI for interacting with Veil Cash privacy pools on Base. This skill
  is written for CLI-first agent workflows, especially OpenClaw-style usage.
author: veildotcash
permissions:
  - filesystem:read
  - filesystem:write
  - shell:exec
triggers:
  - command: /veil
  - pattern: veil init
  - pattern: veil keypair
  - pattern: veil status
  - pattern: veil register
  - pattern: veil deposit
  - pattern: veil balance
  - pattern: veil withdraw
  - pattern: veil transfer
  - pattern: veil merge
  - pattern: unsigned payload
  - pattern: privacy pool
---

# Veil CLI

Use the `veil` CLI for [Veil Cash](https://veil.cash) privacy pools on Base (chain ID `8453`).
Package: `@veil-cash/sdk` on npm.

Default behavior:

- Human-readable output is the default.
- Use `--json` for machine-readable output.
- Use `--unsigned` to emit signer-compatible transaction payloads instead of sending transactions.
- Sensitive wallet material should come from env vars, not CLI flags.

---

## Quick reference

| Task | CLI |
|------|-----|
| Derive keypair from wallet | `veil init` |
| Generate random keypair | `veil init --generate` |
| Show current keypair | `veil keypair` |
| Check setup and relay | `veil status` |
| Register deposit key | `veil register` |
| Build unsigned register payload | `SIGNER_ADDRESS=0x... veil register --unsigned` |
| Deposit ETH | `veil deposit ETH 0.1` |
| Deposit USDC | `veil deposit USDC 100` |
| Show balances | `veil balance` |
| Show queue only | `veil balance queue --pool eth` |
| Show private only | `veil balance private --pool eth` |
| Withdraw | `veil withdraw ETH 0.05 0xRecipient` |
| Transfer privately | `veil transfer ETH 0.02 0xRecipient` |
| Merge UTXOs | `veil merge ETH 0.1` |

---

## 1. Setup

Veil uses:

- `WALLET_KEY` when the CLI should sign and send public transactions itself
- `SIGNER_ADDRESS` when signing happens outside the CLI and you need address-aware reads or `--unsigned` payloads
- `VEIL_KEY` for private actions like `withdraw`, `transfer`, and `merge`
- `DEPOSIT_KEY` as the public key registered on-chain for deposits

Do not set `WALLET_KEY` and `SIGNER_ADDRESS` at the same time. They are mutually exclusive.

Choose one public-wallet mode:

- Local signing mode: set `WALLET_KEY` and let the CLI sign `register` / `deposit` directly.
- External signing mode: set `SIGNER_ADDRESS` and use `--unsigned` when another signer will submit transactions on your behalf.

This is not strictly "agent vs non-agent". Either mode can be used by an agent depending on how that agent is configured.
Bankr-style agents typically use `SIGNER_ADDRESS` because Bankr does the signing and submission for them, so the CLI should return unsigned payloads instead of sending transactions.

Typical first-run flow with local signing:

```bash
export WALLET_KEY=0x...
veil init
veil register
veil status
veil deposit ETH 0.1
veil balance
```

`veil init` defaults to wallet-derived key generation. Use `--generate` for a random keypair instead.

Typical first-run flow with external signing:

```env
VEIL_KEY=0x...
DEPOSIT_KEY=0x...
SIGNER_ADDRESS=0x...
RPC_URL=https://mainnet.base.org
```

```bash
veil init --signature 0x...
veil status
veil register --unsigned
veil deposit ETH 0.1 --unsigned
```

---

## 2. Keypair and Status

Generate or inspect keys:

```bash
veil init
veil init --generate
veil init --signature 0xSIGNATURE
veil init --json
veil keypair
veil keypair --json
```

Check environment, wallet, registration, and relay state:

```bash
veil status
veil status --json
```

`veil status` also shows:

- derived wallet address
- public ETH balance when available
- whether `WALLET_KEY` is missing vs invalid
- registration and relay status

`veil status` can resolve registration using `SIGNER_ADDRESS` whenever signing is handled externally and `WALLET_KEY` is intentionally absent.

---

## 3. Register and Deposit

Register the current `DEPOSIT_KEY` on-chain:

```bash
veil register
veil register --force
veil register --json
SIGNER_ADDRESS=0x... veil register --unsigned
SIGNER_ADDRESS=0x... veil register --unsigned --force
```

Important:

- `--address` is optional in unsigned mode when `SIGNER_ADDRESS` is set.
- Use `WALLET_KEY` if you want the CLI to sign and send the transaction itself.
- Use `SIGNER_ADDRESS` if another system will sign on your behalf and you need an unsigned payload.
- `veil register --unsigned --force` checks chain state first.
- If the address is already registered, it returns `changeDepositKey`.
- If the address is not registered yet, it returns a normal `register` payload.

Deposits treat the CLI amount as the **net** amount that lands in the pool. The `0.3%` protocol fee is calculated on-chain and added automatically.

```bash
veil deposit ETH 0.1
veil deposit USDC 100
veil deposit ETH 0.1 --json
veil deposit ETH 0.1 --unsigned
veil deposit USDC 100 --unsigned
```

Minimums:

- ETH: `0.01`
- USDC: `10`

`--unsigned` notes:

- ETH returns one payload.
- USDC returns `[approve, deposit]`.
- Payloads use `{ to, data, value, chainId }`.

---

## 4. Balance Commands

Combined view:

```bash
veil balance
veil balance --pool eth
veil balance --pool usdc
veil balance --json
```

Queue only:

```bash
veil balance queue
veil balance queue --pool usdc
veil balance queue --address 0x... --json
```

Private only:

```bash
veil balance private
veil balance private --pool usdc --show-utxos
veil balance private --json
```

Human-readable balance output now includes:

- wallet public balances (`ETH`, `USDC`)
- queue and private balances
- optional UTXO details only when explicitly requested

---

## 5. Private Actions

Withdraw from the private pool to a public address:

```bash
veil withdraw ETH 0.05 0xRecipientAddress
veil withdraw USDC 50 0xRecipientAddress
veil withdraw ETH 0.05 0xRecipientAddress --json
```

Transfer privately to another registered address:

```bash
veil transfer ETH 0.02 0xRecipientAddress
veil transfer USDC 25 0xRecipientAddress
veil transfer ETH 0.02 0xRecipientAddress --json
```

Merge UTXOs:

```bash
veil merge ETH 0.1
veil merge USDC 100
veil merge ETH 0.1 --json
```

Human-readable transaction output uses Basescan links instead of raw hashes.

Operational note:

- Withdraw proof generation is forced single-threaded for reliable CLI exit after success.

---

## 6. Unsigned payloads

`--unsigned` is for signer workflows. The CLI emits signer-compatible payloads and does not send the transaction.

Shape:

```json
{
  "to": "0x...",
  "data": "0x...",
  "value": "0",
  "chainId": 8453
}
```

Extra context fields may appear:

- register: `action`
- deposit: `step`

Use `skills/veil/reference.md` for the lower-level payload details.

---

## 7. Security

- Store `VEIL_KEY` and `DEPOSIT_KEY` in `.env.veil`.
- Store `WALLET_KEY` in `.env` or the shell environment.
- Use `SIGNER_ADDRESS` when the signer is external and the CLI should not hold the wallet key.
- `SIGNER_ADDRESS` is especially useful for Bankr-style agents that request `--unsigned` payloads and sign separately.
- `WALLET_KEY` and `SIGNER_ADDRESS` are mutually exclusive. Set only one.
- Never pass sensitive wallet keys on the CLI.
- Never commit secrets to source control.

---

## Additional resources

For exact payload shapes and lower-level details, see [reference.md](reference.md).
