declare module 'ffjavascript' {
  export const utils: {
    stringifyBigInts: (obj: unknown) => unknown;
    unstringifyBigInts: (obj: unknown) => unknown;
  };
}

declare module 'circomlib' {
  const circomlib: {
    poseidon: (items: Array<bigint | string | number>) => { toString: () => string };
  };
  export default circomlib;
}

declare module 'eth-sig-util' {
  import type { EncryptedMessage } from './types.js';

  const ethSigUtil: {
    getEncryptionPublicKey: (privateKey: string) => string;
    encrypt: (
      receiverPublicKey: string,
      msgParams: { data: string },
      version: 'x25519-xsalsa20-poly1305'
    ) => EncryptedMessage;
    decrypt: (encryptedData: EncryptedMessage, receiverPrivateKey: string) => string;
  };
  export default ethSigUtil;
}
