#!/usr/bin/env tsx
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const configPath = resolve(import.meta.dirname, '../src/config.ts');
const outputPath = resolve(import.meta.dirname, '../prisma/auth.prisma');

console.log(`[auth:generate] Running better-auth CLI...`);
execSync(
  `npx @better-auth/cli generate --config ${configPath} --output ${outputPath} --yes`,
  { stdio: 'inherit' },
);
console.log(`[auth:generate] Wrote ${outputPath}`);
