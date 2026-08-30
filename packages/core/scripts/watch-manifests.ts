#!/usr/bin/env tsx
import chokidar from 'chokidar';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');

const watcher = chokidar.watch(`${ROOT}/packages/module-*/src/manifest.ts`, { ignoreInitial: true });

function regenerate() {
  console.log('[watch-manifests] change detected, regenerating routes');
  spawn('pnpm', ['--filter', '@quetzal/core', 'generate:routes'], { stdio: 'inherit', shell: true });
}

watcher.on('add', regenerate).on('change', regenerate).on('unlink', regenerate);
console.log('[watch-manifests] watching packages/module-*/src/manifest.ts');
