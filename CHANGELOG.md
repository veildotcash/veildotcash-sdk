# Changelog

## 0.6.2

- Add `mergeSubaccount()` SDK function to transfer a subaccount's entire private pool balance back to the main wallet via a ZK transfer proof
- Add `getSubaccountPrivateBalance()` SDK helper and include summarized private balances in `getSubaccountStatus()`
- Add `SubaccountMergeOptions` and `SubaccountMergeResult` types
- Add `veil subaccount merge --slot <n> --pool <pool>` CLI command
- Update `veil subaccount status` to show forwarder balances, private balances, and queue state
- Export `mergeSubaccount`, `SubaccountMergeOptions`, and `SubaccountMergeResult` from package entry
- Document merge in `SDK.md`, `README.md`, `SKILL.md`, and `reference.md`

## 0.6.0

- Add SDK-first subaccount support: deterministic slot derivation, forwarder prediction, deployment status, relay-backed deploy/sweep, queue-aware status, and direct recovery transaction building
- Add `src/subaccount.ts` public exports for subaccount derivation, status, relay operations, withdraw typed-data signing, nonce scanning, and recovery transaction creation
- Add forwarder factory address/config plus `FORWARDER_ABI` and `FORWARDER_FACTORY_ABI`
- Add `veil subaccount` CLI command family: `derive`, `status`, `deploy`, `sweep`, `recover`, and `address`
- Add `INVALID_SLOT` CLI error code and extend on-chain error decoding to include forwarder errors
- Document the subaccount mental model and operational caveats in `README.md` and `SDK.md`

## 0.5.0

- Refocus the package docs around the CLI and move SDK usage into `SDK.md`
- Make CLI output human-readable by default with consistent `--json` support
- Add `balance queue` and `balance private` command grouping while keeping compatibility aliases
- Remove `--quiet` and standardize CLI error output
- Mask provider URLs in human-readable `veil status` output
- **Breaking**: Remove `--wallet-key` CLI flag from all commands (use `WALLET_KEY` env instead)
- **Breaking**: Remove `--deposit-key` CLI flag from `register` and `deposit` (use `DEPOSIT_KEY` env instead)
- **Breaking**: Remove `--veil-key`, `--rpc-url`, `--relay-url`, and `--show-utxos` CLI flags — use env vars (`VEIL_KEY`, `RPC_URL`, `RELAY_URL`) instead
- `veil init` now defaults to wallet-derived keypair; random generation moved to `--generate`
- `veil balance` now shows wallet public balances (ETH + USDC) in a "Wallet (public)" section
- Deposit amounts are now **net** (what lands in pool); the 0.3% fee is added automatically via on-chain `getDepositAmountWithFee`
- Transaction hashes in human-readable output replaced with Basescan links
- Remove "Gas used" from all command output (human and JSON)
- Remove "Checked" field from `veil status` human output; show meaningful status messages instead
- `veil status` now shows a consolidated **Signing** row (`local (WALLET_KEY)`, `external (SIGNER_ADDRESS)`, or `not configured`) replacing the previous separate "Wallet key" + "Mode" rows
- `veil status` shows public ETH balance when available from `WALLET_KEY` or `SIGNER_ADDRESS`
- Add `SIGNER_ADDRESS` for unsigned/query CLI flows (`status`, `balance`, `register --unsigned`) when signing is handled externally
- `WALLET_KEY` and `SIGNER_ADDRESS` are now treated as mutually exclusive CLI env vars; setting both raises `CONFIG_CONFLICT`
- `veil init` raises `CONFIG_CONFLICT` when both `WALLET_KEY` and `SIGNER_ADDRESS` are set; provides a context-aware hint when only `SIGNER_ADDRESS` is set
- `veil register --force` now always sends the transaction, even if the on-chain key already matches
- `veil register --unsigned --force` now checks chain state first and emits `register` vs `changeDepositKey` accordingly
- Clean up `--unsigned` description (remove Bankr-specific wording)
- Private balance command (`veil balance private`) no longer prints individual UTXO details in human-readable output; full UTXO data still present in `--json` output

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
