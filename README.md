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

The CLI is human-readable by default. Add `--json` when you want stable machine-readable output. `--unsigned` commands always emit transaction payload JSON for automation and agents.

```bash
# 1. Set your Ethereum wallet key
export WALLET_KEY=0x...

# 2. Derive and save your Veil keypair
veil init

# 3. Register your deposit key (one-time)
veil register

# 4. Check your setup
veil status

# 5. Deposit into the pool (amount is what arrives in your balance; fee added automatically)
veil deposit ETH 0.1
veil deposit USDC 100

# 6. Inspect balances
veil balance
veil balance --pool eth
veil balance queue --pool usdc
veil balance private

# 7. Use privacy actions
veil withdraw ETH 0.05 0xRecipientAddress
veil transfer ETH 0.02 0xRecipientAddress
veil merge ETH 0.1

# 8. Use JSON or unsigned modes when you need automation
veil status --json
veil deposit ETH 0.1 --unsigned
```

## CLI Tasks

### Setup

Derive a Veil keypair from your wallet (default) or generate a random one:

```bash
veil init
veil init --generate
veil init --signature 0x...
veil init --force
veil init --no-save
veil init --json
```

Show the current keypair from `VEIL_KEY`:

```bash
veil keypair
veil keypair --json
```

Check local configuration, registration, and relay health:

```bash
veil status
veil status --json
```

`veil status` also shows the resolved address, public ETH balance when available, and clearer registration status when `WALLET_KEY` is missing or invalid. For unsigned or agent flows, set `SIGNER_ADDRESS` to let `veil status` and balance commands resolve registration without a wallet key.

### Registration and Deposits

Register or update your deposit key on-chain:

```bash
veil register
veil register --force
veil register --json
veil register --unsigned --address 0x...
SIGNER_ADDRESS=0x... veil register --unsigned
```

In `--unsigned` mode, `--address` is optional when `SIGNER_ADDRESS` is set. `veil register --force` checks on-chain state first and emits a `changeDepositKey` payload only if the address is already registered; otherwise it emits a normal `register` payload.

Deposit ETH or USDC into Veil. The amount you specify is the **net** amount that arrives in your Veil balance. The 0.3% protocol fee is calculated on-chain and added automatically:

```bash
veil deposit ETH 0.1            # 0.1 ETH lands in pool, ~0.1003 ETH sent
veil deposit USDC 100           # 100 USDC lands in pool, ~100.30 USDC sent
veil deposit ETH 0.1 --json
veil deposit ETH 0.1 --unsigned
```

### Balances

Show combined balances across queue and private pools:

```bash
veil balance
veil balance --pool eth
veil balance --pool usdc
veil balance --json
```

Inspect queue balances directly:

```bash
veil balance queue
veil balance queue --pool usdc
veil balance queue --address 0x... --json
```

Inspect private balances directly:

```bash
veil balance private
veil balance private --pool usdc
veil balance private --json
```

### Private Actions

Withdraw from the private pool to a public address:

```bash
veil withdraw ETH 0.05 0xRecipientAddress
veil withdraw USDC 50 0xRecipientAddress
veil withdraw ETH 0.05 0xRecipientAddress --json
```

Transfer privately to another registered Veil user:

```bash
veil transfer ETH 0.02 0xRecipientAddress
veil transfer USDC 25 0xRecipientAddress
veil transfer ETH 0.02 0xRecipientAddress --json
```

Merge small UTXOs into one:

```bash
veil merge ETH 0.1
veil merge USDC 100
veil merge ETH 0.1 --json
```

## Environment Variables

The CLI uses two config files:

| File | Purpose |
|------|---------|
| `.env.veil` | Veil keypair (VEIL_KEY, DEPOSIT_KEY) - created by `veil init` |
| `.env` | Wallet config (WALLET_KEY or SIGNER_ADDRESS, RPC_URL) - your existing config |

### Variables

| Variable | Description |
|----------|-------------|
| `VEIL_KEY` | Your Veil private key (for ZK proofs, withdrawals, transfers) |
| `DEPOSIT_KEY` | Your Veil deposit key (public, for register/deposit) |
| `WALLET_KEY` | Ethereum wallet private key (for signing transactions) |
| `SIGNER_ADDRESS` | Ethereum address for unsigned/query flows when signing is handled externally |
| `RPC_URL` | Base RPC URL (optional, defaults to public RPC) |
| `RELAY_URL` | Override relay base URL for relayed CLI operations and status checks |

`WALLET_KEY` and `SIGNER_ADDRESS` are mutually exclusive. Use `WALLET_KEY` for commands that sign transactions, and `SIGNER_ADDRESS` for address-only agent flows like `status`, `balance`, and `register --unsigned`.

## Error Handling

Commands print human-readable success output by default. Errors are standardized JSON with machine-readable error codes so scripts can detect failure cases reliably:

```json
{
  "success": false,
  "errorCode": "VEIL_KEY_MISSING",
  "error": "VEIL_KEY required. Set VEIL_KEY env"
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `VEIL_KEY_MISSING` | VEIL_KEY not provided |
| `WALLET_KEY_MISSING` | WALLET_KEY not provided |
| `DEPOSIT_KEY_MISSING` | DEPOSIT_KEY not provided |
| `CONFIG_CONFLICT` | Conflicting CLI env vars provided |
| `INVALID_ADDRESS` | Invalid Ethereum address format |
| `INVALID_AMOUNT` | Invalid or below minimum amount |
| `INSUFFICIENT_BALANCE` | Not enough ETH balance |
| `USER_NOT_REGISTERED` | Recipient not registered in Veil |
| `NO_UTXOS` | No unspent UTXOs available |
| `RELAY_ERROR` | Error from relayer service |
| `RPC_ERROR` | RPC/network error |
| `CONTRACT_ERROR` | Smart contract reverted |
| `UNKNOWN_ERROR` | Unexpected error |

## SDK Docs

The CLI is the main entrypoint for most users. If you are integrating Veil programmatically, use the dedicated SDK guide:

- [SDK Quick Start and API Reference](./SDK.md)
- [AI agent and signer integration notes](./SDK.md#for-ai-agents)

## Deposit Flow

1. **Set Wallet Key**: `export WALLET_KEY=0x...` in your `.env` or shell
2. **Derive Keypair**: Run `veil init` to derive and save your Veil keypair
3. **Register**: Run `veil register` to link your deposit key on-chain (one-time)
4. **Check Status**: Run `veil status` to verify your setup
5. **Deposit**: Run `veil deposit <asset> <amount>` — the amount is what lands in your balance (e.g., `veil deposit ETH 0.1` deposits 0.1 ETH; the 0.3% fee is added automatically)
6. **Wait**: The Veil deposit engine processes your deposit
7. **Done**: Your deposit is accepted into the privacy pool

## Withdrawal Flow

1. **Check Balance**: Run `veil balance --pool <pool>` to see your private balance
2. **Withdraw**: Run `veil withdraw <asset> <amount> <recipient>`
3. **Done**: The SDK builds ZK proofs and submits via the relayer

## License

MIT
