# Veil ↔ Bankr Integration Goal

> **Purpose**: This document captures the end goal for integrating the Veil SDK with [Bankr](https://bankr.bot) / Moltbot. It should guide SDK design decisions to ensure the SDK is agent-friendly and works seamlessly with Bankr's signing/submission flow.

## Target

Publish a **Moltbot skill** (`veil-bankr-integration`) to the [moltbot-skills library](https://github.com/BankrBot/moltbot-skills) that lets AI agents and users:

1. Generate Veil keypairs
2. Build unsigned register/deposit transactions via the Veil SDK
3. Hand payloads to Bankr for signing and submission

All accessible from Telegram or automated agent flows.

---

## Core Capabilities

### 1. `keypair.generate`
- Generate a Veil keypair (`VEIL_KEY` + `DEPOSIT_KEY`)
- Save securely to `~/.clawdbot/skills/veil/.env.veil` (chmod 600)
- Return the public deposit key to the user

### 2. `register.build`
- Build an **unsigned** register transaction using Veil SDK
- `buildRegisterTx(depositKey, ownerAddress)`
- Return payload JSON: `{ to, data, value, chainId }`

### 3. `register.submit`
- Hand payload to Bankr (Bankr signs & sends using its configured wallet)
- Poll Bankr for job/tx status
- Report TX hash / link back to user

### 4. `deposit.build`
- Build an **unsigned** ETH deposit transaction
- Include `value` (wei as string)
- Return payload JSON for Bankr to sign

### 5. `deposit.submit`
- Hand deposit payload to Bankr for signing/sending
- Poll & report status

---

## Bankr Integration Flow

```
┌─────────────┐     unsigned payload     ┌─────────────┐
│  Veil SDK   │ ──────────────────────► │   Bankr     │
│  (builds)   │   { to, data, value }   │  (signs &   │
└─────────────┘                          │   sends)    │
                                         └─────────────┘
                                               │
                                               ▼
                                         ┌─────────────┐
                                         │   Base L2   │
                                         │  (on-chain) │
                                         └─────────────┘
```

**Key point**: Bankr acts as signer & gas payer. The SDK builds unsigned payloads; Bankr handles wallet management and transaction submission.

### Expected Payload Format

Bankr's [arbitrary transaction format](https://github.com/BankrBot/moltbot-skills/blob/main/bankr/references/arbitrary-transaction.md):

```json
{
  "to": "0x...",
  "data": "0x...",
  "value": "0",
  "chainId": 8453
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string | Yes | Target contract address (0x + 40 hex chars) |
| `data` | string | Yes | Calldata to execute (0x + hex string) |
| `value` | string | Yes | Amount in wei as string (e.g., `"0"`, `"1000000000000000000"` for 1 ETH) |
| `chainId` | number | Yes | Target chain ID (8453 for Base) |

**Important**: `value` must be a string, not a number or bigint.

---

## SDK Design Implications

To support this integration, the SDK should:

1. **JSON-first output** — All CLI commands support `--json` for machine-readable output
2. **Unsigned transaction builders** — `buildRegisterTx`, `buildDepositETHTx` return `{ to, data, value? }` without requiring a signer
3. **No wallet coupling** — Transaction builders don't require wallet/signer; that's the consumer's job (or Bankr's)
4. **Value as string** — `value` must be serialized as a string (wei) for Bankr compatibility
5. **`--unsigned` flag** — CLI commands output Bankr-compatible payload without signing/sending

### `--unsigned` Output Format

When `--unsigned` is passed, CLI commands output the Bankr-compatible payload:

```bash
veil register --unsigned --address 0x...
# {"to":"0x...","data":"0x...","value":"0","chainId":8453}

veil deposit 0.1 --unsigned
# {"to":"0x...","data":"0x...","value":"100000000000000000","chainId":8453}
```

---

## Security & Storage

- `VEIL_KEY` and `DEPOSIT_KEY` stored only under `~/.clawdbot/skills/veil/.env.veil` (chmod 600)
- No secrets committed to repo
- Bankr API key stored separately in `~/.clawdbot/skills/bankr/config.json`
- All on-chain actions require explicit user confirmation

---

## Telegram / UI Triggers

| Command | Action |
|---------|--------|
| `/veil generate` | Generate keypair, DM deposit key |
| `/veil register` | Build register tx → confirm → submit to Bankr |
| `/veil deposit <amount>` | Build deposit tx → confirm → submit to Bankr |

---

## Scripts (Planned)

```
scripts/
├── generate_keypair.sh      # veil keypair create --json
├── build_register.sh        # outputs unsigned register JSON
├── build_deposit.sh         # outputs unsigned deposit JSON
└── submit_to_bankr.sh       # wrapper to call bankr.sh with payload
```

---

## Testing Plan

| Phase | Focus |
|-------|-------|
| **Phase 1** | Scaffold skill + scripts, test locally with SDK CLI (`--json`, `--no-save`) |
| **Phase 2** | Integration with Bankr dev/testnet — sign & submit register + small deposit |
| **Phase 3** | Hardening — confirmations, error handling, retries, timeouts, logging |

---

## Open Questions

1. **Bankr as sole signer** — Confirm Bankr will always be the signer/owner for this flow
2. **Gas estimation** — Should SDK provide gas estimates, or let Bankr handle that?
3. **Error propagation** — How does Bankr report tx failures back to the skill?

---

## References

- [Moltbot Skills Library](https://github.com/BankrBot/moltbot-skills)
- [Bankr](https://bankr.bot)
- [Veil Cash](https://veil.cash)
