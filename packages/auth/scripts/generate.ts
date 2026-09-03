#!/usr/bin/env tsx
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const cwd = resolve(import.meta.dirname, '..');
const configPath = 'src/config.ts';
const outputPath = 'prisma/auth.prisma';

console.log(`[auth:generate] Running better-auth CLI (cwd=${cwd})...`);
execSync(
  `npx auth generate --config ${configPath} --output ${outputPath} -y`,
  { stdio: 'inherit', cwd },
);
console.log(`[auth:generate] Wrote ${resolve(cwd, outputPath)}`);
