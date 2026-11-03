import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.integration.spec.ts'],
    pool: 'threads',
    // Vitest 4 a supprime test.poolOptions : singleThread etait ignore en silence,
    // donc les suites d integration tournaient en parallele sur la meme base.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  plugins: [swc.vite({ module: { type: 'nodenext' } })],
});
