/**
 * Standardized CLI error handling
 */

/**
 * Error codes for machine-readable error handling
 */
export const ErrorCode = {
  VEIL_KEY_MISSING: 'VEIL_KEY_MISSING',
  WALLET_KEY_MISSING: 'WALLET_KEY_MISSING',
  DEPOSIT_KEY_MISSING: 'DEPOSIT_KEY_MISSING',
  CONFIG_CONFLICT: 'CONFIG_CONFLICT',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  USER_NOT_REGISTERED: 'USER_NOT_REGISTERED',
  USER_ALREADY_REGISTERED: 'USER_ALREADY_REGISTERED',
  NO_UTXOS: 'NO_UTXOS',
  RELAY_ERROR: 'RELAY_ERROR',
  RPC_ERROR: 'RPC_ERROR',
  CONTRACT_ERROR: 'CONTRACT_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * CLI Error with error code
 */
export class CLIError extends Error {
  code: ErrorCodeType;

  constructor(code: ErrorCodeType, message: string) {
    super(message);
    this.code = code;
    this.name = 'CLIError';
  }
}

/**
 * Map common error messages to error codes
 */
function inferErrorCode(message: string): ErrorCodeType {
  const msg = message.toLowerCase();
  
  if (msg.includes('veil_key') || msg.includes('veil key')) {
    return ErrorCode.VEIL_KEY_MISSING;
  }
  if (msg.includes('wallet_key') || msg.includes('wallet key')) {
    return ErrorCode.WALLET_KEY_MISSING;
  }
  if (msg.includes('deposit_key') || msg.includes('deposit key')) {
    return ErrorCode.DEPOSIT_KEY_MISSING;
  }
  if (msg.includes('mutually exclusive') || msg.includes('config conflict') || msg.includes('signer_address')) {
    return ErrorCode.CONFIG_CONFLICT;
  }
  if (msg.includes('invalid') && msg.includes('address')) {
    return ErrorCode.INVALID_ADDRESS;
  }
  if (msg.includes('insufficient balance') || msg.includes('not enough')) {
    return ErrorCode.INSUFFICIENT_BALANCE;
  }
  if (msg.includes('not registered')) {
    return ErrorCode.USER_NOT_REGISTERED;
  }
  if (msg.includes('already registered')) {
    return ErrorCode.USER_ALREADY_REGISTERED;
  }
  if (msg.includes('no unspent') || msg.includes('no utxo')) {
    return ErrorCode.NO_UTXOS;
  }
  if (msg.includes('relay')) {
    return ErrorCode.RELAY_ERROR;
  }
  if (msg.includes('rpc') || msg.includes('network') || msg.includes('connection')) {
    return ErrorCode.RPC_ERROR;
  }
  if (msg.includes('revert') || msg.includes('contract')) {
    return ErrorCode.CONTRACT_ERROR;
  }
  
  return ErrorCode.UNKNOWN_ERROR;
}

/**
 * Format error for JSON output
 */
export function formatErrorOutput(error: unknown): { success: false; errorCode: ErrorCodeType; error: string } {
  let code: ErrorCodeType;
  let message: string;

  if (error instanceof CLIError) {
    code = error.code;
    message = error.message;
  } else if (error instanceof Error) {
    message = error.message;
    code = inferErrorCode(message);
  } else {
    message = String(error);
    code = inferErrorCode(message);
  }

  return {
    success: false,
    errorCode: code,
    error: message,
  };
}

/**
 * Handle CLI error: print JSON and exit
 */
export function handleCLIError(error: unknown): never {
  const output = formatErrorOutput(error);
  console.log(JSON.stringify(output, null, 2));
  process.exit(1);
}
