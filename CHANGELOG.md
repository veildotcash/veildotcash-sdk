# Changelog

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
