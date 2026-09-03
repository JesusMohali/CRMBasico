import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Las pruebas comparten una unica base: en paralelo se pisarian entre si.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
