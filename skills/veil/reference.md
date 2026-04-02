# Veil SDK Reference

Detailed payload spec and SDK function signatures for agent integration.

## Unsigned payload spec

All `--unsigned` CLI output and programmatic builders target **Base mainnet** (chain ID 8453).

### Payload shape

```json
{
  "to": "0x...",
  "data": "0x...",
  "value": "0",
  "chainId": 8453
}
```

### Field reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | `string` | yes | Target contract address (`0x` + 40 hex chars) |
| `data` | `string` | yes | ABI-encoded calldata (`0x` + hex) |
| `value` | `string` | yes | ETH amount in wei as a **string** (e.g. `"0"`, `"1000000000000000000"` for 1 ETH) |
| `chainId` | `number` | yes | `8453` (Base) |

`value` must always be a string. For register and USDC transactions it is `"0"`.
For ETH deposits it equals the deposit amount in wei.

### CLI extra fields

The CLI may include an `action` or `step` field for context:

- **Register**: `"action": "register"` or `"action": "changeDepositKey"`
- **Deposit**: `"step": "approve"` (USDC only) and `"step": "deposit"`

These fields are informational and can be ignored by the signer.
For `veil register --unsigned --force`, the CLI checks chain state first and chooses `"register"` vs `"changeDepositKey"` based on whether the address is already registered.

---

## SDK build functions

All functions are exported from `@veil-cash/sdk`.

### Keypair

```typescript
import { Keypair, VEIL_SIGNED_MESSAGE } from '@veil-cash/sdk';
import type { MessageSigner } from '@veil-cash/sdk';

// Random keypair
const keypair = new Keypair();

// Restore from saved private key
const restored = new Keypair('0xSAVED_VEIL_KEY');

// Derive from Ethereum wallet key (same keypair as frontend login)
const derived = await Keypair.fromWalletKey('0xWALLET_KEY');

// Derive from pre-computed EIP-191 signature
const fromSig = Keypair.fromSignature('0xSIG');

// Derive via external signer callback
const fromSigner = await Keypair.fromSigner(async (msg) => {
  return await externalSignerService.personalSign(msg);
});

// Public deposit key (register on-chain)
keypair.depositKey(); // 0x-prefixed, 130 hex chars

// Private key (store securely)
keypair.privkey; // 0x-prefixed, 66 hex chars
```

### Register

```typescript
import { buildRegisterTx, buildChangeDepositKeyTx } from '@veil-cash/sdk';
import type { TransactionData } from '@veil-cash/sdk';

// First-time registration
const tx: TransactionData = buildRegisterTx(depositKey, '0xOWNER_ADDRESS');
// tx = { to: '0x...', data: '0x...' }

// Update existing deposit key
const changeTx: TransactionData = buildChangeDepositKeyTx(newDepositKey, '0xOWNER_ADDRESS');
```

`TransactionData` type:

```typescript
interface TransactionData {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}
```

For register transactions `value` is `undefined` (use `"0"` when forwarding to signer).

### Deposit

```typescript
import {
  buildDepositETHTx,
  buildDepositUSDCTx,
  buildApproveUSDCTx,
  buildDepositTx,
} from '@veil-cash/sdk';

// ETH deposit
const ethTx = buildDepositETHTx({ depositKey, amount: '0.1' });
// ethTx.value = 100000000000000000n (bigint)

// USDC deposit (two-step)
const approveTx = buildApproveUSDCTx({ amount: '100' });
const usdcTx = buildDepositUSDCTx({ depositKey, amount: '100' });

// Generic (routes to ETH or USDC builder)
const tx = buildDepositTx({ depositKey, amount: '0.1', token: 'ETH' });
```

When serializing for a signer: `value` must be converted to a string (`tx.value?.toString() ?? '0'`).

### Balance

```typescript
import { getQueueBalance, getPrivateBalance } from '@veil-cash/sdk';

// Queue balance (pending deposits)
const queue = await getQueueBalance({
  address: '0x...',
  pool: 'eth',
});

// Private balance (in-pool UTXOs)
const priv = await getPrivateBalance({
  keypair,
  pool: 'eth',
});
```

---

## CLI quick reference

Install globally: `npm install -g @veil-cash/sdk`

### Environment variables

| Variable | Description |
|----------|-------------|
| `VEIL_KEY` | Veil private key (for ZK proofs) |
| `DEPOSIT_KEY` | Veil deposit key (public) |
| `WALLET_KEY` | Ethereum wallet private key (for signing) |
| `RPC_URL` | Base RPC URL (optional, defaults to public RPC) |
| `RELAY_URL` | Override relay base URL for relayed CLI operations |

### Commands

```bash
veil init --json                                   # Derive from wallet as JSON (default)
veil init --json --no-save                         # Derive without saving to disk
veil init --generate                               # Generate random keypair
veil init --signature 0x...                        # Derive from signature

veil keypair                                       # Show current keypair

veil register --unsigned --address 0x...           # Unsigned register payload
veil register --unsigned --address 0x... --force   # Unsigned register/change-key payload (depends on chain state)

veil deposit ETH 0.1 --unsigned                    # Unsigned ETH deposit payload
veil deposit USDC 100 --unsigned                   # Unsigned USDC deposit payload(s)

veil balance                                       # All pool balances
veil balance --pool eth                            # ETH pool only
veil balance --pool usdc                           # USDC pool only
veil balance queue --pool eth                      # Queue-only balance
veil balance private --pool eth                    # Private-only balance

veil status                                        # Check config, wallet ETH balance, and service health
```

### Error format

All CLI errors output JSON with a standardized `errorCode`:

```json
{
  "success": false,
  "errorCode": "VEIL_KEY_MISSING",
  "error": "VEIL_KEY required. Set VEIL_KEY env"
}
```

Common codes: `VEIL_KEY_MISSING`, `WALLET_KEY_MISSING`, `DEPOSIT_KEY_MISSING`,
`INVALID_AMOUNT`, `INSUFFICIENT_BALANCE`, `CONTRACT_ERROR`, `RPC_ERROR`.

---

## Deposit minimums

| Asset | Minimum (net) | Notes |
|-------|--------------|-------|
| ETH | 0.01 | Fee (0.3%) added automatically via on-chain `getDepositAmountWithFee` |
| USDC | 10 | Fee (0.3%) added automatically via on-chain `getDepositAmountWithFee` |

The CLI amount is the **net** amount that lands in the pool. The fee is calculated on-chain and added to the transaction automatically — users do not need to account for it.

---

## Links

- npm: [@veil-cash/sdk](https://www.npmjs.com/package/@veil-cash/sdk)
- Veil Cash: [https://veil.cash](https://veil.cash)
