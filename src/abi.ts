/**
 * Veil Entry Contract ABI
 */

export const ENTRY_ABI = [
  // ============ ERRORS ============
  { inputs: [], name: 'DepositsDisabled', type: 'error' },
  { inputs: [], name: 'FeeTransferFailed', type: 'error' },
  { inputs: [], name: 'InvalidDepositKey', type: 'error' },
  { inputs: [], name: 'InvalidDepositKeyForUser', type: 'error' },
  { inputs: [], name: 'InvalidInitialization', type: 'error' },
  { inputs: [], name: 'MinimumDepositNotMet', type: 'error' },
  { inputs: [], name: 'NotAllowedToDeposit', type: 'error' },
  { inputs: [], name: 'NotInitializing', type: 'error' },
  { inputs: [], name: 'OnlyOperatorAllowed', type: 'error' },
  { inputs: [], name: 'OnlyOwnerCanRegister', type: 'error' },
  { inputs: [], name: 'OnlyQueueContractAllowed', type: 'error' },
  { inputs: [{ name: 'owner', type: 'address' }], name: 'OwnableInvalidOwner', type: 'error' },
  { inputs: [{ name: 'account', type: 'address' }], name: 'OwnableUnauthorizedAccount', type: 'error' },
  { inputs: [], name: 'ReentrancyGuardReentrantCall', type: 'error' },
  { inputs: [], name: 'USDCTransferFailed', type: 'error' },
  { inputs: [], name: 'UserAlreadyRegistered', type: 'error' },
  { inputs: [], name: 'UserNotRegistered', type: 'error' },

  // ============ EVENTS ============
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: false, name: 'key', type: 'bytes' },
    ],
    name: 'DepositKey',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'depositor', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
    name: 'DepositedETH',
    type: 'event',
  },

  // ============ FUNCTIONS ============
  
  // Register deposit key
  {
    inputs: [
      {
        components: [
          { name: 'owner', type: 'address' },
          { name: 'depositKey', type: 'bytes' },
        ],
        name: '_account',
        type: 'tuple',
      },
    ],
    name: 'register',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // Queue ETH deposit
  {
    inputs: [{ name: '_depositKey', type: 'bytes' }],
    name: 'queueETH',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },

  // Queue USDC deposit
  {
    inputs: [
      { name: '_amount', type: 'uint256' },
      { name: '_depositKey', type: 'bytes' },
    ],
    name: 'queueUSDC',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // Read deposit keys
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'depositKeys',
    outputs: [{ name: '', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },

  // Check if deposits are enabled
  {
    inputs: [],
    name: 'depositETHEnabled',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },

  // Get deposit fee
  {
    inputs: [],
    name: 'depositFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },

  // Get minimum deposit
  {
    inputs: [],
    name: 'minimumDeposit',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },

  // Calculate fee and net deposit
  {
    inputs: [{ name: '_totalAmount', type: 'uint256' }],
    name: 'getFeeAndNetDeposit',
    outputs: [
      { name: 'netDeposit', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },

  // Calculate deposit amount with fee
  {
    inputs: [{ name: '_netDepositAmount', type: 'uint256' }],
    name: 'getDepositAmountWithFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },

  // Check if user is allowed depositor
  {
    inputs: [{ name: '_depositor', type: 'address' }],
    name: 'isAllowedDepositor',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Queue Contract ABI (for balance queries)
 */
export const QUEUE_ABI = [
  // Get all pending deposit nonces
  {
    inputs: [],
    name: 'getPendingDeposits',
    outputs: [{ name: 'nonces', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Get deposit details by nonce
  {
    inputs: [{ name: '_nonce', type: 'uint256' }],
    name: 'getDeposit',
    outputs: [
      {
        components: [
          { name: 'fallbackReceiver', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint256' },
          { name: 'shieldAmount', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'depositKey', type: 'bytes' },
        ],
        name: 'deposit',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // Get current nonce counter
  {
    inputs: [],
    name: 'depositQueueNonce',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Get pending count
  {
    inputs: [],
    name: 'getPendingCount',
    outputs: [{ name: 'count', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * ETH Pool Contract ABI
 */
export const POOL_ABI = [
  // ============ ERRORS ============
  { inputs: [], name: 'CannotWithdrawToZeroAddress', type: 'error' },
  { inputs: [], name: 'ETHTransferFailed', type: 'error' },
  { inputs: [], name: 'IncorrectExternalDataHash', type: 'error' },
  { inputs: [], name: 'InputAlreadySpent', type: 'error' },
  { inputs: [], name: 'InvalidExtAmount', type: 'error' },
  { inputs: [], name: 'InvalidFee', type: 'error' },
  { inputs: [], name: 'InvalidMerkleRoot', type: 'error' },
  { inputs: [], name: 'InvalidPublicAmount', type: 'error' },
  { inputs: [], name: 'InvalidRange', type: 'error' },
  { inputs: [], name: 'InvalidTransactionProof', type: 'error' },
  { inputs: [], name: 'OnlyForDeposits', type: 'error' },
  { inputs: [], name: 'OnlyForTransfers', type: 'error' },
  { inputs: [], name: 'OnlyForWithdrawals', type: 'error' },
  { inputs: [], name: 'OnlyValidatorContractAllowed', type: 'error' },
  { inputs: [], name: 'OnlyWETHContractAllowed', type: 'error' },
  { inputs: [{ name: 'owner', type: 'address' }], name: 'OwnableInvalidOwner', type: 'error' },
  { inputs: [{ name: 'account', type: 'address' }], name: 'OwnableUnauthorizedAccount', type: 'error' },
  { inputs: [], name: 'ProofAmountMismatch', type: 'error' },
  { inputs: [], name: 'ReentrancyGuardReentrantCall', type: 'error' },
  { inputs: [], name: 'UnsupportedInputCount', type: 'error' },
  { inputs: [], name: 'WETHDepositFailed', type: 'error' },
  { inputs: [], name: 'WETHUnwrapFailed', type: 'error' },

  // ============ EVENTS ============
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: 'commitment', type: 'bytes32' },
      { indexed: false, name: 'index', type: 'uint256' },
      { indexed: false, name: 'encryptedOutput', type: 'bytes' },
    ],
    name: 'NewCommitment',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [{ indexed: false, name: 'nullifier', type: 'bytes32' }],
    name: 'NewNullifier',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'previousOwner', type: 'address' },
      { indexed: true, name: 'newOwner', type: 'address' },
    ],
    name: 'OwnershipTransferred',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, name: 'newValidatorContract', type: 'address' }],
    name: 'ValidatorContractUpdated',
    type: 'event',
  },

  // ============ VIEW FUNCTIONS ============
  {
    inputs: [],
    name: 'FIELD_SIZE',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'ROOT_HISTORY_SIZE',
    outputs: [{ name: '', type: 'uint32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'ZERO_VALUE',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'uint256' }],
    name: 'commitments',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'currentRootIndex',
    outputs: [{ name: '', type: 'uint32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'uint256' }],
    name: 'encryptedOutputs',
    outputs: [{ name: '', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'uint256' }],
    name: 'filledSubtrees',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'startIndex', type: 'uint256' },
      { name: 'endIndex', type: 'uint256' },
    ],
    name: 'getCommitments',
    outputs: [{ name: '', type: 'bytes32[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'startIndex', type: 'uint256' },
      { name: 'endIndex', type: 'uint256' },
    ],
    name: 'getEncryptedOutputs',
    outputs: [{ name: '', type: 'bytes[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getLastRoot',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: '_left', type: 'bytes32' },
      { name: '_right', type: 'bytes32' },
    ],
    name: 'hashLeftRight',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'hasher',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_root', type: 'bytes32' }],
    name: 'isKnownRoot',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_nullifierHash', type: 'bytes32' }],
    name: 'isSpent',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'levels',
    outputs: [{ name: '', type: 'uint32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'nextIndex',
    outputs: [{ name: '', type: 'uint32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'bytes32' }],
    name: 'nullifierHashes',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'uint256' }],
    name: 'roots',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'validatorContract',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'verifier16',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'verifier2',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'weth',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'i', type: 'uint256' }],
    name: 'zeros',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'pure',
    type: 'function',
  },

  // ============ PURE FUNCTIONS ============
  {
    inputs: [
      { name: '_extAmount', type: 'int256' },
      { name: '_fee', type: 'uint256' },
    ],
    name: 'calculatePublicAmount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'pure',
    type: 'function',
  },

  // ============ WRITE FUNCTIONS ============
  {
    inputs: [
      {
        components: [
          { name: 'proof', type: 'bytes' },
          { name: 'root', type: 'bytes32' },
          { name: 'inputNullifiers', type: 'bytes32[]' },
          { name: 'outputCommitments', type: 'bytes32[2]' },
          { name: 'publicAmount', type: 'uint256' },
          { name: 'extDataHash', type: 'bytes32' },
        ],
        name: '_args',
        type: 'tuple',
      },
      {
        components: [
          { name: 'recipient', type: 'address' },
          { name: 'extAmount', type: 'int256' },
          { name: 'relayer', type: 'address' },
          { name: 'fee', type: 'uint256' },
          { name: 'encryptedOutput1', type: 'bytes' },
          { name: 'encryptedOutput2', type: 'bytes' },
        ],
        name: '_extData',
        type: 'tuple',
      },
    ],
    name: 'depositETH',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { name: 'proof', type: 'bytes' },
          { name: 'root', type: 'bytes32' },
          { name: 'inputNullifiers', type: 'bytes32[]' },
          { name: 'outputCommitments', type: 'bytes32[2]' },
          { name: 'publicAmount', type: 'uint256' },
          { name: 'extDataHash', type: 'bytes32' },
        ],
        name: '_args',
        type: 'tuple',
      },
      {
        components: [
          { name: 'recipient', type: 'address' },
          { name: 'extAmount', type: 'int256' },
          { name: 'relayer', type: 'address' },
          { name: 'fee', type: 'uint256' },
          { name: 'encryptedOutput1', type: 'bytes' },
          { name: 'encryptedOutput2', type: 'bytes' },
        ],
        name: '_extData',
        type: 'tuple',
      },
    ],
    name: 'transactETH',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { name: 'proof', type: 'bytes' },
          { name: 'root', type: 'bytes32' },
          { name: 'inputNullifiers', type: 'bytes32[]' },
          { name: 'outputCommitments', type: 'bytes32[2]' },
          { name: 'publicAmount', type: 'uint256' },
          { name: 'extDataHash', type: 'bytes32' },
        ],
        name: '_args',
        type: 'tuple',
      },
      {
        components: [
          { name: 'recipient', type: 'address' },
          { name: 'extAmount', type: 'int256' },
          { name: 'relayer', type: 'address' },
          { name: 'fee', type: 'uint256' },
          { name: 'encryptedOutput1', type: 'bytes' },
          { name: 'encryptedOutput2', type: 'bytes' },
        ],
        name: '_extData',
        type: 'tuple',
      },
    ],
    name: 'withdrawETH',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { name: 'proof', type: 'bytes' },
          { name: 'root', type: 'bytes32' },
          { name: 'inputNullifiers', type: 'bytes32[]' },
          { name: 'outputCommitments', type: 'bytes32[2]' },
          { name: 'publicAmount', type: 'uint256' },
          { name: 'extDataHash', type: 'bytes32' },
        ],
        name: '_args',
        type: 'tuple',
      },
    ],
    name: 'verifyProof',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'newOwner', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: '_newValidator', type: 'address' }],
    name: 'updateValidatorContract',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // ============ RECEIVE ============
  { stateMutability: 'payable', type: 'receive' },
] as const;

/**
 * ERC20 ABI (for USDC approval)
 */
export const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
