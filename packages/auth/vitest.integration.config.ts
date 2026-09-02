import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.integration.spec.ts'],
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
