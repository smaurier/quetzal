import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: { globals: false, environment: 'node', include: ['src/**/*.spec.ts'] },
  plugins: [swc.vite({ module: { type: 'nodenext' } })],
});
