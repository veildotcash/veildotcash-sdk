/**
 * CJS/ESM interop for legacy dependencies that only ship CommonJS.
 *
 * eth-sig-util sets __esModule: true but has no default export — only named
 * exports. circomlib uses module.exports = { poseidon, ... }.
 *
 * Using namespace imports (import * as X) works reliably across both tsup's
 * CJS and ESM outputs, and browser bundlers (webpack/vite) handle them correctly.
 */

import * as _ethSigUtil from 'eth-sig-util';
import * as _circomlib from 'circomlib';

function resolveInterop<T>(mod: T): T {
  if (mod && typeof mod === 'object' && 'default' in (mod as object)) {
    const defaultVal = (mod as unknown as { default: T }).default;
    if (defaultVal != null) return defaultVal;
  }
  return mod;
}

export const ethSigUtil = resolveInterop(_ethSigUtil);
export const circomlib = resolveInterop(_circomlib);
