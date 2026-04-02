# Changelog

## 0.5.0

- Refocus the package docs around the CLI and move SDK usage into `SDK.md`
- Make CLI output human-readable by default with consistent `--json` support
- Add `balance queue` and `balance private` command grouping while keeping compatibility aliases
- Remove `--quiet` and standardize CLI error output
- Mask provider URLs in human-readable `veil status` output
- Add `--relay-url` support to `veil status` health checks
- **Breaking**: Remove `--wallet-key` CLI flag from all commands (use `WALLET_KEY` env instead)
- **Breaking**: Remove `--deposit-key` CLI flag from `register` and `deposit` (use `DEPOSIT_KEY` env instead)
- `veil init` now defaults to wallet-derived keypair; random generation moved to `--generate`
- `veil balance` now shows wallet public balances (ETH + USDC) in a "Wallet (public)" section
- Deposit amounts are now **net** (what lands in pool); the 0.3% fee is added automatically via on-chain `getDepositAmountWithFee`
- Transaction hashes in human-readable output replaced with Basescan links
- Remove "Gas used" from all command output (human and JSON)
- Remove "Checked" field from `veil status` human output; show meaningful status messages instead
- `veil status` now distinguishes missing vs invalid `WALLET_KEY` and shows public ETH balance when available
- `veil register --force` now always sends the transaction, even if the on-chain key already matches
- `veil register --unsigned --force` now checks chain state first and emits `register` vs `changeDepositKey` accordingly
- Clean up `--unsigned` description (remove Bankr-specific wording)

## 0.4.0

- **Breaking**: Remove deprecated cbBTC pool — `buildDepositCBBTCTx`, `buildApproveCBBTCTx`, and the `queueBTC` ABI entry have been removed
- **Breaking**: `Token` type narrowed from `'ETH' | 'USDC' | 'CBBTC'` to `'ETH' | 'USDC'`
- **Breaking**: `RelayPool` type narrowed from `'eth' | 'usdc' | 'cbbtc'` to `'eth' | 'usdc'`
- Remove `cbbtcPool`, `cbbtcQueue`, `cbbtcToken` from `ADDRESSES` and `NetworkAddresses`
- Remove `cbbtc` entry from `POOL_CONFIG`
- CLI commands (deposit, withdraw, transfer, merge, balance) no longer accept `CBBTC`/`cbbtc`
- `veil init --json` now includes `veilPrivateKey` field (alias for `veilKey`) for consistency with `veil keypair` output
- `veil init --json` now includes `derivation` field (`"wallet-signature"`, `"provided-signature"`, or `"random"`)

## 0.3.0

- Add `Keypair.fromWalletKey(walletKey)` -- derive Veil keypair from an Ethereum wallet key (same keypair as frontend login)
- Add `Keypair.fromSignature(signature)` -- derive keypair from any EIP-191 personal_sign signature
- Add `Keypair.fromSigner(fn)` -- generic callback for external signers (Bankr, MPC, custodial, etc.)
- Add `VEIL_SIGNED_MESSAGE` constant and `MessageSigner` type export
- CLI: add `--sign-message` + `--wallet-key` flags to `veil init` for wallet-derived keypairs
- CLI: add `--signature` flag to `veil init` for pre-computed signatures
- CLI: remove `--out` flag from `veil init` (always saves to `.env.veil`)
- Add `buildChangeDepositKeyTx()` for updating an existing deposit key on-chain
- CLI: `veil register --force` now changes the deposit key if already registered with a different key
- **Breaking**: Rename `btc`/`BTC` pool to `cbbtc`/`CBBTC` across the entire package (types, addresses, CLI commands, functions)
- Rename `buildDepositBTCTx` -> `buildDepositCBBTCTx`, `buildApproveBTCTx` -> `buildApproveCBBTCTx`
- Rename address keys: `btcPool`/`btcQueue`/`btcToken` -> `cbbtcPool`/`cbbtcQueue`/`cbbtcToken`

## 0.2.0

- **Breaking**: CLI commands now require asset argument (e.g., `veil deposit ETH 0.1` instead of `veil deposit 0.1`)
- Applies to: deposit, withdraw, transfer, merge
- Add `veil status` command to check configuration and service status

## 0.1.1

- Initial public release
