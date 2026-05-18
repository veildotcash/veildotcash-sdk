declare module 'ffjavascript' {
  export const utils: {
    stringifyBigInts: (obj: unknown) => unknown;
    unstringifyBigInts: (obj: unknown) => unknown;
  };
}

declare module 'circomlib' {
  export const poseidon: (items: Array<bigint | string | number>) => { toString: () => string };
  const circomlib: {
    poseidon: typeof poseidon;
  };
  export default circomlib;
}

declare module 'eth-sig-util' {
  import type { EncryptedMessage } from './types.js';

  export function getEncryptionPublicKey(privateKey: string): string;
  export function encrypt(
    receiverPublicKey: string,
    msgParams: { data: string },
    version: 'x25519-xsalsa20-poly1305'
  ): EncryptedMessage;
  export function decrypt(encryptedData: EncryptedMessage, receiverPrivateKey: string): string;

  const ethSigUtil: {
    getEncryptionPublicKey: typeof getEncryptionPublicKey;
    encrypt: typeof encrypt;
    decrypt: typeof decrypt;
  };
  export default ethSigUtil;
}
