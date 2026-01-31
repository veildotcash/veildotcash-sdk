import { defineConfig } from 'tsup';

export default defineConfig([
  // SDK build
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
  },
  // CLI build
  {
    entry: ['src/cli/index.ts'],
    outDir: 'dist/cli',
    format: ['cjs'],
    splitting: false,
    sourcemap: false,
    clean: false,
    treeshake: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
    noExternal: ['commander', 'dotenv'],
  },
]);
