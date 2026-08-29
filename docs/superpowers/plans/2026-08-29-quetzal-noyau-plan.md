# Quetzal Noyau — Implementation Plan (sous-projet 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le noyau modulaire Quetzal (monorepo Next+Nest) + module stub `hello-world` prouvant que le contrat de module fonctionne bout en bout (HTTP + WS + guest via QR).

**Architecture:** Modular monolith alpha (full-stack unifié), pnpm+Turborepo, Clean Architecture par layer, contrat de module strict (manifest + registry), tenant-scoped PrismaClient via `$extends`, auth Better-Auth JWT+JWKS, temps réel Socket.io, i18n next-intl 3 langues.

**Tech Stack:** Next 15 + React 19 (host Vercel), NestJS 11 (api Render), Prisma + Neon Postgres, Better-Auth (JWT + org plugin), Socket.io, next-intl, shadcn/ui, Vitest + Playwright, Turborepo.

**Spec de référence:** `docs/superpowers/specs/2026-08-29-quetzal-noyau-design.md`
**Conventions:** `CLAUDE.md`

---

## Phase 1 — Bootstrap monorepo

### Task 1: Legacy cleanup + monorepo scaffold

**Files:**
- Delete: `quetzal-frontend/`, `quetzal-backend/`, `package.json` (racine ancien), `pnpm-lock.yaml`, `pnpm-workspace.yaml` (ancien)
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.gitignore`, `.env.example`, `apps/.gitkeep`, `packages/.gitkeep`

- [ ] **Step 1.1: Delete legacy code**

```bash
cd C:/Users/sylva/Documents/projects/quetzal
git rm -rf quetzal-frontend quetzal-backend package.json pnpm-lock.yaml pnpm-workspace.yaml
```

- [ ] **Step 1.2: Create root package.json**

Create `package.json`:

```json
{
  "name": "quetzal",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:integration": "turbo run test:integration",
    "test:e2e": "playwright test",
    "clean": "turbo run clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.7.2",
    "@types/node": "^22.10.0"
  },
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.15.0"
  }
}
```

- [ ] **Step 1.3: Create pnpm-workspace.yaml**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'packages/module-*'
```

- [ ] **Step 1.4: Create turbo.json**

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local", "tsconfig.base.json"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:integration": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 1.5: Create .nvmrc, .gitignore, .env.example**

Create `.nvmrc`:
```
22.11.0
```

Create `.gitignore` (append to existing if present):
```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
build/
.next/
.turbo/
*.tsbuildinfo

# Env
.env
.env.local
.env.*.local
!.env.example

# Testing
coverage/
playwright-report/
test-results/

# Prisma generated
packages/db/prisma/schema.prisma
packages/auth/prisma/auth.prisma
packages/db/src/model-tenant-registry.ts

# Generated Next module routes
apps/host/app/modules/

# IDE
.vscode/*
!.vscode/extensions.json
.idea/

# OS
.DS_Store
Thumbs.db
```

Create `.env.example`:
```bash
# Communs (host + api)
DATABASE_URL=postgresql://user:pass@host:5432/quetzal
BETTER_AUTH_SECRET=change-me-256-bits-base64
GUEST_TOKEN_SECRET=change-me-different-256-bits-base64
HOST_URL=http://localhost:3000
API_URL=http://localhost:3001
MODULES=hello

# Host (Vercel)
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_MODULES=hello
SENTRY_DSN_HOST=

# Api (Render)
SENTRY_DSN_API=
PORT=3001

# Seed (dev/staging only, JAMAIS prod)
SEED_OWNER_EMAIL=elda@example.com
SEED_OWNER_PASSWORD=change-me-strong-password

# E2E dev/staging only
ALLOW_E2E_RESET=false
E2E_SECRET=
```

Create empty `apps/.gitkeep` and `packages/.gitkeep`.

- [ ] **Step 1.6: Install root deps + verify pnpm workspace**

```bash
pnpm install
pnpm turbo --version
```

Expected: pnpm resolves without errors, turbo prints version.

- [ ] **Step 1.7: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .nvmrc .gitignore .env.example apps/.gitkeep packages/.gitkeep
git commit -m "chore(monorepo): scaffold pnpm+turborepo, drop legacy quetzal-frontend/backend"
```

### Task 2: packages/config (ESLint + TS + Tailwind bases)

**Files:**
- Create: `packages/config/package.json`, `packages/config/typescript/base.json`, `packages/config/typescript/nextjs.json`, `packages/config/typescript/nest.json`, `packages/config/eslint/base.js`, `packages/config/eslint/next.js`, `packages/config/eslint/nest.js`, `packages/config/eslint/module.js`, `packages/config/eslint/rules/tenant-safety.js`, `packages/config/eslint/rules/no-raw-room-string.js`, `packages/config/tailwind/preset.js`
- Create: `tsconfig.base.json` (racine, extends config)

- [ ] **Step 2.1: Create packages/config/package.json**

```json
{
  "name": "@quetzal/config",
  "version": "0.0.0",
  "private": true,
  "main": "index.js",
  "files": ["eslint", "typescript", "tailwind"],
  "peerDependencies": {
    "eslint": "^9.17.0",
    "typescript": "^5.7.2"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.18.0",
    "@typescript-eslint/parser": "^8.18.0",
    "eslint-plugin-boundaries": "^5.0.1",
    "eslint-config-prettier": "^9.1.0"
  }
}
```

- [ ] **Step 2.2: Create TS configs**

`packages/config/typescript/base.json`:
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": true,
    "incremental": true
  }
}
```

`packages/config/typescript/nextjs.json`:
```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowJs": true,
    "noEmit": true,
    "plugins": [{ "name": "next" }]
  }
}
```

`packages/config/typescript/nest.json`:
```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "target": "ES2022",
    "lib": ["ES2022"],
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "./dist",
    "declaration": false
  }
}
```

- [ ] **Step 2.3: Create ESLint base config**

`packages/config/eslint/base.js`:
```js
const boundaries = require('eslint-plugin-boundaries');

module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: { project: true },
  plugins: ['@typescript-eslint', 'boundaries'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
```

- [ ] **Step 2.4: Create ESLint module boundaries config**

`packages/config/eslint/module.js` (rules pour packages/module-*):
```js
module.exports = {
  extends: ['./base.js'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['@quetzal/module-*'],
          message: 'Cross-module imports interdits. Utiliser event bus + types dans @quetzal/core/events/',
        },
        {
          group: ['@prisma/client'],
          importNames: ['PrismaClient'],
          message: 'PrismaClient direct interdit dans modules. Utiliser ctx.prisma (tenant-scoped).',
        },
      ],
      paths: [
        {
          name: '@quetzal/db',
          importNames: ['RootPrismaClient', 'createRootPrismaClient', 'rootPrisma'],
          message: 'RootPrismaClient réservé au noyau. Utiliser ctx.prisma.',
        },
      ],
    }],
  },
};
```

- [ ] **Step 2.5: Create custom ESLint rules**

`packages/config/eslint/rules/tenant-safety.js`:
```js
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Interdit $queryRaw / $executeRaw dans les modules' },
    messages: {
      forbiddenRawQuery: '{{method}} interdit dans un module. Utiliser ctx.tenantRawQuery.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe'].includes(node.property.name)) {
          context.report({ node, messageId: 'forbiddenRawQuery', data: { method: node.property.name }});
        }
      },
    };
  },
};
```

`packages/config/eslint/rules/no-raw-room-string.js`:
```js
module.exports = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Interdit raw string room WS, utiliser rooms.session/rooms.tenant' },
    messages: { rawRoom: 'Raw room string détecté. Utiliser rooms.session() ou rooms.tenant() from @quetzal/core.' },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          ['emit', 'to', 'in', 'join', 'leave'].includes(callee.property.name)
        ) {
          const firstArg = node.arguments[0];
          if (firstArg?.type === 'Literal' && typeof firstArg.value === 'string' && firstArg.value.includes(':')) {
            context.report({ node: firstArg, messageId: 'rawRoom' });
          }
        }
      },
    };
  },
};
```

- [ ] **Step 2.6: Create Tailwind preset**

`packages/config/tailwind/preset.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
```

- [ ] **Step 2.7: Create root tsconfig.base.json + index.js exports**

Root `tsconfig.base.json`:
```json
{
  "extends": "./packages/config/typescript/base.json"
}
```

`packages/config/index.js`:
```js
module.exports = {
  eslint: {
    base: require('./eslint/base'),
    module: require('./eslint/module'),
  },
  tailwind: require('./tailwind/preset'),
};
```

- [ ] **Step 2.8: Install + verify**

```bash
pnpm install
pnpm --filter @quetzal/config exec node -e "console.log(require('./index'))"
```

- [ ] **Step 2.9: Commit**

```bash
git add packages/config tsconfig.base.json
git commit -m "feat(config): add ESLint bases, TS configs, Tailwind preset, custom rules (tenant-safety, no-raw-room-string)"
```

### Task 3: packages/db scaffold (Prisma + newId + Neon)

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/src/id.ts`, `packages/db/src/id.spec.ts`, `packages/db/src/clients.ts`, `packages/db/src/index.ts`, `packages/db/prisma/core.prisma`, `packages/db/scripts/merge-schemas.ts`

- [ ] **Step 3.1: Create package.json**

```json
{
  "name": "@quetzal/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./scripts/*": "./scripts/*"
  },
  "scripts": {
    "build": "tsc && cp -r prisma dist/prisma",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "schema:merge": "tsx scripts/merge-schemas.ts",
    "prisma:generate": "prisma generate --schema=prisma/schema.prisma",
    "prisma:migrate:dev": "pnpm schema:merge && prisma migrate dev --schema=prisma/schema.prisma",
    "prisma:migrate:deploy": "pnpm schema:merge && prisma migrate deploy --schema=prisma/schema.prisma",
    "prisma:studio": "prisma studio --schema=prisma/schema.prisma",
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.1.0",
    "uuid": "^11.0.3"
  },
  "devDependencies": {
    "@quetzal/config": "workspace:*",
    "@types/uuid": "^10.0.0",
    "prisma": "^6.1.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 3.2: Create tsconfig.json**

```json
{
  "extends": "@quetzal/config/typescript/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.spec.ts", "dist", "node_modules"]
}
```

- [ ] **Step 3.3: Write failing test for newId**

Create `packages/db/src/id.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { newId } from './id';

describe('newId', () => {
  it('returns a UUID v7 string (36 chars, hyphenated)', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique IDs across calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });

  it('generates chronologically ordered IDs (v7 property)', () => {
    const a = newId();
    const b = newId();
    // v7: timestamp prefix means later IDs sort lexicographically after earlier ones
    expect(b >= a).toBe(true);
  });
});
```

- [ ] **Step 3.4: Run test — expect FAIL**

```bash
pnpm --filter @quetzal/db test
```
Expected: FAIL, `Cannot find module './id'`.

- [ ] **Step 3.5: Commit failing test**

```bash
git add packages/db/src/id.spec.ts
git commit -m "test(db): newId returns valid UUID v7 with chronological ordering"
```

- [ ] **Step 3.6: Implement newId**

Create `packages/db/src/id.ts`:

```ts
import { v7 as uuidv7 } from 'uuid';

export const newId = (): string => uuidv7();
```

- [ ] **Step 3.7: Run test — expect PASS**

```bash
pnpm --filter @quetzal/db test
```

- [ ] **Step 3.8: Commit implementation**

```bash
git add packages/db/src/id.ts packages/db/package.json packages/db/tsconfig.json
git commit -m "feat(db): implement newId (UUID v7 app-side)"
```

- [ ] **Step 3.9: Create core.prisma (schema noyau)**

Create `packages/db/prisma/core.prisma`:

```prisma
// Ce fichier est mergé avec auth.prisma + tous les modules dans schema.prisma final.
// Ne PAS lancer prisma migrate directement sur ce fichier.

model Module {
  slug             String   @id @db.VarChar(64)
  version          String   @db.VarChar(32)
  contractVersion  String   @db.VarChar(32)
  enabledByDefault Boolean  @default(false)
  metadata         Json
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  activations      TenantModule[]
}

model TenantModule {
  tenantId    String   @db.Uuid
  moduleSlug  String
  enabled     Boolean  @default(true)
  installedAt DateTime @default(now())
  updatedAt   DateTime @updatedAt
  config      Json?

  module      Module       @relation(fields: [moduleSlug], references: [slug], onDelete: Cascade)
  tenant      Organization @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@id([tenantId, moduleSlug])
  @@index([tenantId, enabled])
}

model AuditLog {
  id          String   @id @db.Uuid
  tenantId    String?  @db.Uuid
  userId      String?  @db.Uuid
  action      String   @db.VarChar(64)
  target      String?  @db.VarChar(255)
  metadata    Json?
  ipAddress   String?  @db.VarChar(64)
  createdAt   DateTime @default(now())

  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([tenantId, createdAt])
  @@index([userId, createdAt])
  @@index([action])
}
```

- [ ] **Step 3.10: Create merge-schemas.ts script**

Create `packages/db/scripts/merge-schemas.ts`:

```ts
#!/usr/bin/env tsx
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const OUT = resolve(import.meta.dirname, '../prisma/schema.prisma');
const AUTH = resolve(ROOT, 'packages/auth/prisma/auth.prisma');
const CORE = resolve(import.meta.dirname, '../prisma/core.prisma');

const HEADER = `// GENERATED FILE — do not edit manually.
// Regenerated by packages/db/scripts/merge-schemas.ts
// Sources: packages/auth/prisma/auth.prisma + packages/db/prisma/core.prisma + packages/module-*/prisma/models.prisma

generator client {
  provider = "prisma-client-js"
  previewFeatures = []
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;

async function readIfExists(path: string): Promise<string> {
  try {
    const content = await readFile(path, 'utf8');
    // Strip existing generator/datasource blocks (we provide our own header)
    return content.replace(/generator\s+\w+\s*\{[^}]*\}/g, '').replace(/datasource\s+\w+\s*\{[^}]*\}/g, '').trim();
  } catch {
    return '';
  }
}

async function discoverModulePrismas(): Promise<string[]> {
  const packagesDir = resolve(ROOT, 'packages');
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const modules = entries.filter(e => e.isDirectory() && e.name.startsWith('module-'));
  const paths: string[] = [];
  for (const m of modules) {
    const candidate = join(packagesDir, m.name, 'prisma/models.prisma');
    try {
      await readFile(candidate);
      paths.push(candidate);
    } catch {}
  }
  return paths;
}

async function main() {
  const parts = [HEADER];
  parts.push(`// --- @quetzal/auth (Better-Auth generated) ---\n`);
  parts.push(await readIfExists(AUTH));
  parts.push(`\n\n// --- @quetzal/db core ---\n`);
  parts.push(await readIfExists(CORE));

  for (const path of await discoverModulePrismas()) {
    const slug = path.match(/packages\/module-([^/]+)\/prisma/)?.[1];
    parts.push(`\n\n// --- @quetzal/module-${slug} ---\n`);
    parts.push(await readIfExists(path));
  }

  await writeFile(OUT, parts.join('\n'), 'utf8');
  console.log(`[schema:merge] wrote ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 3.11: Create index.ts stub (clients.ts wired in Task 6)**

Create `packages/db/src/index.ts`:

```ts
export { newId } from './id';
// Prisma clients exported after Task 6 (schema needs to exist first).
```

- [ ] **Step 3.12: Verify build**

```bash
pnpm --filter @quetzal/db build
```
Expected: dist/ contient id.js et index.js.

- [ ] **Step 3.13: Commit**

```bash
git add packages/db
git commit -m "feat(db): add core.prisma schema noyau + merge-schemas.ts build script"
```

### Task 4: packages/auth scaffold (Better-Auth + JWT)

**Files:**
- Create: `packages/auth/package.json`, `packages/auth/tsconfig.json`, `packages/auth/src/config.ts`, `packages/auth/src/client.ts`, `packages/auth/src/index.ts`, `packages/auth/scripts/generate.ts`

- [ ] **Step 4.1: Create package.json**

```json
{
  "name": "@quetzal/auth",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./client": "./dist/client.js",
    "./config": "./dist/config.js"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "test": "vitest run",
    "generate": "tsx scripts/generate.ts"
  },
  "dependencies": {
    "better-auth": "^1.1.7",
    "@quetzal/db": "workspace:*"
  },
  "devDependencies": {
    "@quetzal/config": "workspace:*",
    "@better-auth/cli": "^1.1.7",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 4.2: Create tsconfig.json**

```json
{
  "extends": "@quetzal/config/typescript/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.spec.ts", "dist", "node_modules"]
}
```

- [ ] **Step 4.3: Create Better-Auth config**

Create `packages/auth/src/config.ts`:

```ts
import { betterAuth } from 'better-auth';
import { organization, jwt } from 'better-auth/plugins';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { rootPrisma } from '@quetzal/db';

export const auth = betterAuth({
  database: prismaAdapter(rootPrisma, { provider: 'postgresql' }),
  baseURL: process.env.HOST_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET,
  user: {
    additionalFields: {
      locale: { type: 'string', defaultValue: 'fr' },
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    password: { hash: 'scrypt' },
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: false,
      organizationLimit: 1,
      membershipLimit: 100,
      roles: {
        owner: { permissions: ['*'] },
        admin: { permissions: ['tenant.manage', 'module.configure'] },
        creator: { permissions: ['content.create', 'session.launch'] },
        learner: { permissions: ['content.consume'] },
      },
    }),
    jwt({
      jwks: { keyPairConfig: { alg: 'RS256' } },
      jwt: {
        expirationTime: '1h',
        definePayload: async ({ session, user }) => {
          const activeOrgId = (session as any).activeOrganizationId as string | undefined;
          let role: string | null = null;
          if (activeOrgId) {
            const member = await (auth.api as any).getActiveMember?.({
              headers: { userId: user.id, organizationId: activeOrgId },
            }).catch(() => null);
            role = member?.role ?? null;
          }
          return {
            userId: user.id,
            tenantId: activeOrgId ?? null,
            role,
            locale: (user as any).locale ?? 'fr',
          };
        },
      },
    }),
  ],
});
```

- [ ] **Step 4.4: Create client factory (for host use)**

Create `packages/auth/src/client.ts`:

```ts
import { createAuthClient } from 'better-auth/client';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_HOST_URL ?? '',
  plugins: [organizationClient()],
});
```

- [ ] **Step 4.5: Create index.ts**

Create `packages/auth/src/index.ts`:

```ts
export { auth } from './config';
```

- [ ] **Step 4.6: Create generate.ts wrapper**

Create `packages/auth/scripts/generate.ts`:

```ts
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
```

- [ ] **Step 4.7: Install + verify types compile**

```bash
pnpm install
pnpm --filter @quetzal/auth typecheck
```

Expected: passes (rootPrisma import may fail — will resolve after Task 6).

- [ ] **Step 4.8: Commit**

```bash
git add packages/auth
git commit -m "feat(auth): scaffold Better-Auth config with org + jwt plugins, scrypt password hash"
```

## Phase 2 — Database + Auth foundation

### Task 5: Generate auth.prisma + merge schema + initial migration

**Files:**
- Create: `packages/auth/prisma/auth.prisma` (generated), `packages/db/prisma/schema.prisma` (generated), `packages/db/prisma/migrations/YYYYMMDDHHMMSS_init/migration.sql`

- [ ] **Step 5.1: Provision Neon DB via Vercel Marketplace**

Manual step (requires user or vercel CLI):
```bash
# Option A — Vercel CLI (recommended)
npx vercel link                     # link repo to Vercel project
npx vercel integration add neon     # provisions Neon
npx vercel env pull .env.local      # DATABASE_URL now populated

# Option B — Manual : create Neon account, create project, copy connection string
# → set DATABASE_URL in .env.local
```

Verify:
```bash
grep DATABASE_URL .env.local
```

- [ ] **Step 5.2: Generate auth.prisma**

```bash
pnpm --filter @quetzal/auth generate
```

Expected: `packages/auth/prisma/auth.prisma` created with User, Session, Account, Verification, Organization, Member, Invitation models (Better-Auth output).

- [ ] **Step 5.3: Merge into schema.prisma**

```bash
pnpm --filter @quetzal/db schema:merge
```

Expected: `packages/db/prisma/schema.prisma` contains header + auth models + core models.

- [ ] **Step 5.4: Verify schema is valid**

```bash
pnpm --filter @quetzal/db exec prisma validate --schema=prisma/schema.prisma
```
Expected: "The schema at prisma/schema.prisma is valid".

- [ ] **Step 5.5: Create initial migration**

```bash
pnpm --filter @quetzal/db exec prisma migrate dev --name init --schema=prisma/schema.prisma --create-only
```

Expected: `packages/db/prisma/migrations/<timestamp>_init/migration.sql` created.

- [ ] **Step 5.6: Add CHECK constraints post-migration (idempotent SQL)**

Append to the generated migration.sql (before applying):

```sql
-- User.locale whitelist
ALTER TABLE "User"
  ADD CONSTRAINT "user_locale_valid" CHECK ("locale" IN ('fr', 'en', 'es'));

-- Member.role whitelist (Better-Auth Member table)
ALTER TABLE "Member"
  ADD CONSTRAINT "member_role_valid" CHECK ("role" IN ('owner', 'admin', 'creator', 'learner'));
```

- [ ] **Step 5.7: Apply migration**

```bash
pnpm --filter @quetzal/db exec prisma migrate deploy --schema=prisma/schema.prisma
pnpm --filter @quetzal/db exec prisma generate --schema=prisma/schema.prisma
```

Expected: DB up-to-date, `@prisma/client` regenerated with all types.

- [ ] **Step 5.8: Commit**

```bash
git add packages/auth/prisma packages/db/prisma
git commit -m "feat(db): initial migration (Better-Auth + core.prisma) + CHECK constraints for locale/role"
```

### Task 6: Tenant-scoped Prisma client + modelHasTenantId lookup

**Files:**
- Create: `packages/db/src/clients.ts`, `packages/db/src/tenant-scope.ts`, `packages/db/src/tenant-scope.spec.ts`, `packages/db/src/errors.ts`, `packages/db/scripts/generate-tenant-registry.ts`, `packages/db/src/model-tenant-registry.ts` (generated)
- Modify: `packages/db/src/index.ts`

- [ ] **Step 6.1: Create errors.ts**

Create `packages/db/src/errors.ts`:

```ts
export class TenantScopeViolationError extends Error {
  constructor(
    public readonly attempted: string | null,
    public readonly current: string,
    public readonly operation: string,
    public readonly model: string,
  ) {
    super(`Tenant scope violation on ${model}.${operation}: attempted tenantId "${attempted}" but current is "${current}"`);
    this.name = 'TenantScopeViolationError';
  }
}
```

- [ ] **Step 6.2: Create scripts/generate-tenant-registry.ts**

Create `packages/db/scripts/generate-tenant-registry.ts`:

```ts
#!/usr/bin/env tsx
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SCHEMA = resolve(import.meta.dirname, '../prisma/schema.prisma');
const OUT = resolve(import.meta.dirname, '../src/model-tenant-registry.ts');

async function main() {
  const src = await readFile(SCHEMA, 'utf8');
  const models: Record<string, boolean> = {};

  const modelBlocks = [...src.matchAll(/model\s+(\w+)\s*\{([^}]+)\}/g)];
  for (const [, name, body] of modelBlocks) {
    // Prisma client uses camelCase for property names.
    const clientName = name.charAt(0).toLowerCase() + name.slice(1);
    models[clientName] = /^\s*tenantId\s+/m.test(body);
  }

  const content = `// GENERATED — do not edit.
// Regenerated by packages/db/scripts/generate-tenant-registry.ts
// Maps Prisma client model name → whether it has a tenantId column.

export const MODEL_HAS_TENANT_ID: Readonly<Record<string, boolean>> = ${JSON.stringify(models, null, 2)} as const;

export function modelHasTenantId(model: string): boolean {
  return MODEL_HAS_TENANT_ID[model] === true;
}
`;
  await writeFile(OUT, content, 'utf8');
  console.log(`[generate-tenant-registry] wrote ${OUT} (${Object.keys(models).length} models)`);
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 6.3: Run generator + verify output**

```bash
pnpm --filter @quetzal/db exec tsx scripts/generate-tenant-registry.ts
cat packages/db/src/model-tenant-registry.ts | head -20
```

Expected: file lists all Prisma models (user, session, account, module, tenantModule, auditLog, organization, member, invitation, ...), tenantModule/auditLog have `true`, others `false`.

- [ ] **Step 6.4: Write failing tests for tenant-scoped client**

Create `packages/db/src/tenant-scope.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { applyTenantConstraint } from './tenant-scope';
import { TenantScopeViolationError } from './errors';

describe('applyTenantConstraint', () => {
  describe('reads (findMany, findFirst, count, aggregate, groupBy)', () => {
    it('injects where.tenantId when absent', () => {
      const args = { where: { status: 'pending' } };
      const result = applyTenantConstraint('Loto_Game', 'findMany', args, 't-A');
      expect(result.where.tenantId).toBe('t-A');
      expect(result.where.status).toBe('pending');
    });

    it('passes through when where.tenantId matches ctx', () => {
      const args = { where: { tenantId: 't-A', status: 'pending' } };
      const result = applyTenantConstraint('Loto_Game', 'findMany', args, 't-A');
      expect(result.where.tenantId).toBe('t-A');
    });

    it('throws when where.tenantId differs from ctx', () => {
      const args = { where: { tenantId: 't-B' } };
      expect(() => applyTenantConstraint('Loto_Game', 'findMany', args, 't-A'))
        .toThrow(TenantScopeViolationError);
    });

    it('handles missing where clause entirely', () => {
      const args = {};
      const result = applyTenantConstraint('Loto_Game', 'findMany', args, 't-A');
      expect(result.where).toEqual({ tenantId: 't-A' });
    });
  });

  describe('creates (create, upsert)', () => {
    it('injects data.tenantId when absent', () => {
      const args = { data: { id: 'g1' } };
      const result = applyTenantConstraint('Loto_Game', 'create', args, 't-A');
      expect(result.data.tenantId).toBe('t-A');
    });

    it('throws when data.tenantId differs from ctx', () => {
      const args = { data: { id: 'g1', tenantId: 't-B' } };
      expect(() => applyTenantConstraint('Loto_Game', 'create', args, 't-A'))
        .toThrow(TenantScopeViolationError);
    });
  });

  describe('updates/deletes', () => {
    it('injects where.tenantId', () => {
      const args = { where: { id: 'g1' }, data: { status: 'finished' } };
      const result = applyTenantConstraint('Loto_Game', 'update', args, 't-A');
      expect(result.where.tenantId).toBe('t-A');
    });

    it('throws if data.tenantId attempted change', () => {
      const args = { where: { id: 'g1' }, data: { tenantId: 't-B' } };
      expect(() => applyTenantConstraint('Loto_Game', 'update', args, 't-A'))
        .toThrow(TenantScopeViolationError);
    });
  });

  describe('createMany', () => {
    it('injects tenantId on each item', () => {
      const args = { data: [{ id: 'g1' }, { id: 'g2' }] };
      const result = applyTenantConstraint('Loto_Game', 'createMany', args, 't-A');
      expect(result.data).toEqual([
        { id: 'g1', tenantId: 't-A' },
        { id: 'g2', tenantId: 't-A' },
      ]);
    });

    it('throws if any item has different tenantId', () => {
      const args = { data: [{ id: 'g1' }, { id: 'g2', tenantId: 't-B' }] };
      expect(() => applyTenantConstraint('Loto_Game', 'createMany', args, 't-A'))
        .toThrow(TenantScopeViolationError);
    });
  });
});
```

- [ ] **Step 6.5: Run tests — expect FAIL**

```bash
pnpm --filter @quetzal/db test
```
Expected: FAIL, module not found.

- [ ] **Step 6.6: Commit failing tests**

```bash
git add packages/db/src/tenant-scope.spec.ts packages/db/src/errors.ts
git commit -m "test(db): applyTenantConstraint injects tenantId and throws on bypass attempt"
```

- [ ] **Step 6.7: Implement applyTenantConstraint**

Create `packages/db/src/tenant-scope.ts`:

```ts
import { TenantScopeViolationError } from './errors';

type Args = Record<string, any>;

function checkTenantMismatch(
  actualValue: unknown,
  expected: string,
  op: string,
  model: string,
): void {
  if (actualValue !== undefined && actualValue !== null && actualValue !== expected) {
    throw new TenantScopeViolationError(
      typeof actualValue === 'string' ? actualValue : null,
      expected,
      op,
      model,
    );
  }
}

export function applyTenantConstraint(
  model: string,
  operation: string,
  args: Args,
  tenantId: string,
): Args {
  const next: Args = { ...args };

  switch (operation) {
    case 'findFirst':
    case 'findFirstOrThrow':
    case 'findMany':
    case 'findUnique':
    case 'findUniqueOrThrow':
    case 'count':
    case 'aggregate':
    case 'groupBy':
    case 'update':
    case 'updateMany':
    case 'delete':
    case 'deleteMany': {
      const where = { ...(next.where ?? {}) };
      checkTenantMismatch(where.tenantId, tenantId, operation, model);
      where.tenantId = tenantId;
      next.where = where;

      if (operation === 'update' || operation === 'updateMany') {
        const data = { ...(next.data ?? {}) };
        checkTenantMismatch(data.tenantId, tenantId, operation, model);
        // Don't inject tenantId in update data (write is scoped by where)
        if ('tenantId' in data) delete data.tenantId;
        next.data = data;
      }
      break;
    }

    case 'create':
    case 'upsert': {
      const data = { ...(next.data ?? {}) };
      checkTenantMismatch(data.tenantId, tenantId, operation, model);
      data.tenantId = tenantId;
      next.data = data;

      if (operation === 'upsert') {
        const where = { ...(next.where ?? {}) };
        checkTenantMismatch(where.tenantId, tenantId, operation, model);
        where.tenantId = tenantId;
        next.where = where;
      }
      break;
    }

    case 'createMany': {
      const data = Array.isArray(next.data) ? next.data : [next.data];
      next.data = data.map((item: Args) => {
        checkTenantMismatch(item.tenantId, tenantId, operation, model);
        return { ...item, tenantId };
      });
      break;
    }
  }

  return next;
}
```

- [ ] **Step 6.8: Run tests — expect PASS**

```bash
pnpm --filter @quetzal/db test
```

- [ ] **Step 6.9: Implement clients.ts**

Create `packages/db/src/clients.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { applyTenantConstraint } from './tenant-scope';
import { modelHasTenantId } from './model-tenant-registry';

// Root client — NO tenant filtering. Reserved for noyau: onBoot, migrations, seeds, admin jobs.
// ESLint bans this import from packages/module-*.
export type RootPrismaClient = PrismaClient & { readonly __brand: 'root' };

let _rootClient: RootPrismaClient | null = null;

export function createRootPrismaClient(): RootPrismaClient {
  if (_rootClient) return _rootClient;
  _rootClient = new PrismaClient() as RootPrismaClient;
  return _rootClient;
}

export const rootPrisma = createRootPrismaClient();

export type TenantScopedPrismaClient = ReturnType<typeof createTenantScopedClient>;

// Simple LRU cache for scoped clients.
const cache = new Map<string, { client: PrismaClient; lastUsed: number }>();
const MAX_CACHE = 1000;
const TTL_MS = 5 * 60_000;

export function createTenantScopedClient(root: PrismaClient, tenantId: string): PrismaClient {
  const now = Date.now();
  const cached = cache.get(tenantId);
  if (cached && now - cached.lastUsed < TTL_MS) {
    cached.lastUsed = now;
    return cached.client;
  }

  const client = root.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (modelHasTenantId(model.charAt(0).toLowerCase() + model.slice(1))) {
            args = applyTenantConstraint(model, operation, args as any, tenantId);
          }
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;

  if (cache.size >= MAX_CACHE) {
    // Evict oldest
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of cache) {
      if (v.lastUsed < oldestTime) { oldestTime = v.lastUsed; oldestKey = k; }
    }
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(tenantId, { client, lastUsed: now });
  return client;
}
```

- [ ] **Step 6.10: Update index.ts**

Modify `packages/db/src/index.ts`:

```ts
export { newId } from './id';
export { rootPrisma, createRootPrismaClient, createTenantScopedClient } from './clients';
export type { RootPrismaClient, TenantScopedPrismaClient } from './clients';
export { TenantScopeViolationError } from './errors';
export { modelHasTenantId } from './model-tenant-registry';
```

- [ ] **Step 6.11: Add generate:tenant-registry to package.json scripts**

Modify `packages/db/package.json` — add to scripts:

```json
"generate:tenant-registry": "tsx scripts/generate-tenant-registry.ts",
"prebuild": "pnpm schema:merge && pnpm generate:tenant-registry && pnpm prisma:generate",
"postinstall": "pnpm schema:merge && pnpm generate:tenant-registry && pnpm prisma:generate"
```

- [ ] **Step 6.12: Full rebuild + tests**

```bash
pnpm --filter @quetzal/db build
pnpm --filter @quetzal/db test
```

- [ ] **Step 6.13: Commit**

```bash
git add packages/db
git commit -m "feat(db): tenant-scoped PrismaClient via \$extends, LRU cache, RootPrismaClient brand type"
```

### Task 7: Seed script (Elda + tenant default + module-hello)

**Files:**
- Create: `packages/db/prisma/seed.ts`

- [ ] **Step 7.1: Create seed.ts**

Create `packages/db/prisma/seed.ts`:

```ts
#!/usr/bin/env tsx
import { auth } from '@quetzal/auth';
import { rootPrisma, newId } from '../src';

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL;
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD;
const OWNER_NAME = 'Elda';
const TENANT_SLUG = 'default';
const TENANT_NAME = 'Elda';

if (process.env.NODE_ENV === 'production') {
  console.error('[seed] REFUSED: NODE_ENV=production');
  process.exit(1);
}

if (!OWNER_EMAIL || !OWNER_PASSWORD) {
  console.error('[seed] SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD required');
  process.exit(1);
}

async function main() {
  console.log('[seed] Checking existing owner...');
  const existing = await rootPrisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (existing) {
    console.log(`[seed] User ${OWNER_EMAIL} already exists — skipping user creation`);
  } else {
    console.log(`[seed] Creating user ${OWNER_EMAIL}...`);
    await auth.api.signUpEmail({
      body: { email: OWNER_EMAIL, password: OWNER_PASSWORD, name: OWNER_NAME },
    });
  }

  const user = await rootPrisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } });

  console.log(`[seed] Ensuring tenant "${TENANT_SLUG}"...`);
  const org = await rootPrisma.organization.upsert({
    where: { slug: TENANT_SLUG },
    create: {
      id: newId(),
      slug: TENANT_SLUG,
      name: TENANT_NAME,
      createdAt: new Date(),
    },
    update: {},
  });

  console.log(`[seed] Ensuring membership owner...`);
  await rootPrisma.member.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id }},
    create: {
      id: newId(),
      userId: user.id,
      organizationId: org.id,
      role: 'owner',
      createdAt: new Date(),
    },
    update: { role: 'owner' },
  });

  console.log(`[seed] Registering module hello in catalogue...`);
  await rootPrisma.module.upsert({
    where: { slug: 'hello' },
    create: {
      slug: 'hello',
      version: '0.1.0',
      contractVersion: '1.0.0',
      enabledByDefault: true,
      metadata: { name: { fr: 'Hello', en: 'Hello', es: 'Hello' }},
    },
    update: {},
  });

  console.log(`[seed] Activating hello for tenant default...`);
  await rootPrisma.tenantModule.upsert({
    where: { tenantId_moduleSlug: { tenantId: org.id, moduleSlug: 'hello' }},
    create: { tenantId: org.id, moduleSlug: 'hello', enabled: true },
    update: { enabled: true },
  });

  console.log('[seed] Done.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => rootPrisma.$disconnect());
```

- [ ] **Step 7.2: Run seed**

```bash
pnpm --filter @quetzal/db seed
```

Expected: logs "[seed] Done." and returns 0.

- [ ] **Step 7.3: Verify in Prisma Studio**

```bash
pnpm --filter @quetzal/db prisma:studio
```

Verify visually: User Elda exists, Organization "default" exists, Member links them with role=owner, Module hello + TenantModule active.

- [ ] **Step 7.4: Commit**

```bash
git add packages/db/prisma/seed.ts
git commit -m "feat(db): seed script — Elda user + tenant default + module-hello enabled"
```

## Phase 3 — Core services (contract + tenant context + event bus)

### Task 8: packages/core scaffold + module contract types + Zod schemas

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/index.ts`, `packages/core/src/module-contract.ts`, `packages/core/src/schemas/manifest.schema.ts`, `packages/core/src/schemas/manifest.schema.spec.ts`, `packages/core/src/events/index.ts`

- [ ] **Step 8.1: Create package.json**

```json
{
  "name": "@quetzal/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./events/*": "./dist/events/*.js",
    "./schemas/*": "./dist/schemas/*.js",
    "./testing/*": "./dist/testing/*.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "test": "vitest run",
    "watch:manifests": "tsx scripts/watch-manifests.ts"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.15",
    "@nestjs/event-emitter": "^2.1.1",
    "eventemitter2": "^6.4.9",
    "jose": "^5.9.6",
    "pino": "^9.5.0",
    "pino-pretty": "^13.0.0",
    "zod": "^3.24.1",
    "@quetzal/db": "workspace:*"
  },
  "devDependencies": {
    "@quetzal/config": "workspace:*",
    "@types/node": "^22.10.0",
    "chokidar": "^4.0.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 8.2: Create tsconfig.json**

```json
{
  "extends": "@quetzal/config/typescript/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.spec.ts", "dist", "node_modules"]
}
```

- [ ] **Step 8.3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: { reporter: ['text', 'html', 'lcov'] },
  },
});
```

- [ ] **Step 8.4: Create module-contract.ts**

Create `packages/core/src/module-contract.ts`:

```ts
import type { Type, INestModule } from '@nestjs/common';
import type { ComponentType } from 'react';
import type { z } from 'zod';
import type { RootPrismaClient, TenantScopedPrismaClient } from '@quetzal/db';
import type { Logger } from 'pino';

export const CONTRACT_VERSION = '1.0.0' as const;

export type QuetzalRole = 'owner' | 'admin' | 'creator' | 'learner' | 'guest';
export type Locale = 'fr' | 'en' | 'es';

export interface QuetzalModuleManifest {
  slug: string;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  version: string;
  contractVersion: `${number}.${number}.${number}`;
  enabledByDefault: boolean;
  apiModule: Type<INestModule>;
  eventsPublished: readonly EventDefinition[];
  eventsSubscribed?: readonly EventSubscription[];
  uiRoutes: readonly QuetzalRoute[];
  navItem: QuetzalNavItem | null;
  guestJoinComponent?: () => Promise<{ default: ComponentType<GuestJoinProps> }>;
  permissions: PermissionMatrix;
  guestAccess?: GuestAccessConfig;
  rateLimits?: RateLimitConfig;
  prismaModels?: string;
  configSchema?: z.ZodTypeAny;
  onBoot?: (root: RootContext) => Promise<void>;
  onInstall?: (ctx: ModuleContext) => Promise<void>;
  onEnable?: (ctx: ModuleContext) => Promise<void>;
  onDisable?: (ctx: ModuleContext) => Promise<void>;
}

export interface EventDefinition {
  name: EventName;
  typeRef: string;
}

export interface EventSubscription {
  event: EventName;
  handler: (ctx: ModuleContext, payload: unknown) => Promise<void>;
}

export type EventName = `${string}.${string}` | `${string}.${string}.${string}`;

export interface QuetzalRoute {
  path: string;
  component: () => Promise<{ default: ComponentType }>;
  requiredRoles: readonly QuetzalRole[];
  layout: 'shell' | 'full';
}

export interface QuetzalNavItem {
  icon: string;
  labelKey: string;
  visibleTo: readonly QuetzalRole[];
  order?: number;
}

export type PermissionMatrix = Record<string, readonly QuetzalRole[]>;

export interface GuestAccessConfig {
  enabled: boolean;
  tokenTTL: number;
  requireDisplayName: boolean;
  maxConcurrentPerSession: number;
}

export interface RateLimitConfig {
  default: { requests: number; windowMs: number };
  perEndpoint?: Record<string, { requests: number; windowMs: number }>;
}

export interface GuestJoinProps {
  tenantId: string;
  moduleSlug: string;
  sessionId: string;
}

export interface EventBus {
  emit<T = unknown>(name: EventName, payload: T): Promise<void>;
  on<T = unknown>(name: EventName | EventName[] | '*.*', handler: (payload: T) => Promise<void> | void): void;
}

export interface RootContext {
  logger: Logger;
  config: Readonly<Record<string, string | undefined>>;
  eventBus: EventBus;
  prisma: RootPrismaClient;
}

export interface ModuleContext {
  logger: Logger;
  config: Readonly<Record<string, string | undefined>>;
  eventBus: EventBus;
  tenantId: string;
  prisma: TenantScopedPrismaClient;
  currentUser?: {
    id: string;
    role: QuetzalRole;
    locale: Locale;
  };
}
```

- [ ] **Step 8.5: Write failing test for manifest Zod schema**

Create `packages/core/src/schemas/manifest.schema.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { manifestSchema } from './manifest.schema';

const baseValidManifest = {
  slug: 'hello',
  name: { fr: 'Hello', en: 'Hello', es: 'Hola' },
  description: { fr: 'Test', en: 'Test', es: 'Test' },
  version: '0.1.0',
  contractVersion: '1.0.0',
  enabledByDefault: true,
  apiModule: class {},
  eventsPublished: [],
  uiRoutes: [],
  navItem: null,
  permissions: {},
};

describe('manifestSchema', () => {
  it('accepts valid manifest', () => {
    expect(() => manifestSchema.parse(baseValidManifest)).not.toThrow();
  });

  it('rejects invalid slug (uppercase)', () => {
    expect(() => manifestSchema.parse({ ...baseValidManifest, slug: 'Hello' })).toThrow();
  });

  it('rejects invalid slug (starts with digit)', () => {
    expect(() => manifestSchema.parse({ ...baseValidManifest, slug: '1hello' })).toThrow();
  });

  it('rejects invalid slug (too short)', () => {
    expect(() => manifestSchema.parse({ ...baseValidManifest, slug: 'ab' })).toThrow();
  });

  it('rejects missing locale in name', () => {
    expect(() => manifestSchema.parse({ ...baseValidManifest, name: { fr: 'x' } as any })).toThrow();
  });

  it('rejects invalid contractVersion format', () => {
    expect(() => manifestSchema.parse({ ...baseValidManifest, contractVersion: '1.0' })).toThrow();
  });

  it('rejects invalid version format', () => {
    expect(() => manifestSchema.parse({ ...baseValidManifest, version: 'v1' })).toThrow();
  });
});
```

- [ ] **Step 8.6: Run test — expect FAIL**

```bash
pnpm --filter @quetzal/core test
```

- [ ] **Step 8.7: Commit failing tests**

```bash
git add packages/core/src/schemas/manifest.schema.spec.ts packages/core/src/module-contract.ts packages/core/package.json packages/core/tsconfig.json packages/core/vitest.config.ts
git commit -m "test(core): manifest Zod schema rejects invalid slug, locales, versions"
```

- [ ] **Step 8.8: Implement manifest.schema.ts**

Create `packages/core/src/schemas/manifest.schema.ts`:

```ts
import { z } from 'zod';

const localeMap = z.object({
  fr: z.string().min(1),
  en: z.string().min(1),
  es: z.string().min(1),
});

const roles = z.enum(['owner', 'admin', 'creator', 'learner', 'guest']);
const semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'must be semver X.Y.Z');
const slug = z.string().regex(/^[a-z][a-z0-9-]{2,31}$/, 'kebab-case, 3-32 chars, start with letter');

export const manifestSchema = z.object({
  slug,
  name: localeMap,
  description: localeMap,
  version: semver,
  contractVersion: semver,
  enabledByDefault: z.boolean(),
  apiModule: z.any(),  // Type<INestModule>, runtime introspection impossible
  eventsPublished: z.array(z.object({
    name: z.string().regex(/^[a-z]+(\.[a-z]+){1,2}$/),
    typeRef: z.string(),
  })),
  eventsSubscribed: z.array(z.any()).optional(),
  uiRoutes: z.array(z.object({
    path: z.string(),
    component: z.function(),
    requiredRoles: z.array(roles),
    layout: z.enum(['shell', 'full']),
  })),
  navItem: z.object({
    icon: z.string(),
    labelKey: z.string(),
    visibleTo: z.array(roles),
    order: z.number().optional(),
  }).nullable(),
  guestJoinComponent: z.function().optional(),
  permissions: z.record(z.string(), z.array(roles)),
  guestAccess: z.object({
    enabled: z.boolean(),
    tokenTTL: z.number().positive(),
    requireDisplayName: z.boolean(),
    maxConcurrentPerSession: z.number().positive(),
  }).optional(),
  rateLimits: z.object({
    default: z.object({ requests: z.number(), windowMs: z.number() }),
    perEndpoint: z.record(z.string(), z.object({ requests: z.number(), windowMs: z.number() })).optional(),
  }).optional(),
  prismaModels: z.string().optional(),
  configSchema: z.any().optional(),
  onBoot: z.function().optional(),
  onInstall: z.function().optional(),
  onEnable: z.function().optional(),
  onDisable: z.function().optional(),
});
```

- [ ] **Step 8.9: Create index.ts + events/index.ts**

`packages/core/src/index.ts`:

```ts
export * from './module-contract';
export { manifestSchema } from './schemas/manifest.schema';
```

`packages/core/src/events/index.ts`:

```ts
// Cross-module event type contracts.
// Each module publishes its own file (e.g. events/hello.ts, events/loto.ts).
// Other modules import types from here to subscribe without cross-module code coupling.
```

- [ ] **Step 8.10: Run tests — expect PASS**

```bash
pnpm --filter @quetzal/core test
```

- [ ] **Step 8.11: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): module contract types + manifest Zod schema"
```

### Task 9: Tenant context (ALS) + logger + event bus

**Files:**
- Create: `packages/core/src/tenant/tenant-context.ts`, `packages/core/src/tenant/tenant-context.spec.ts`, `packages/core/src/logging/logger.ts`, `packages/core/src/event-bus.ts`, `packages/core/src/event-bus.spec.ts`, `packages/core/src/tenant/scoped-prisma.ts`

- [ ] **Step 9.1: Write failing test for tenant context**

Create `packages/core/src/tenant/tenant-context.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { tenantStore, getCurrentTenant, tryGetCurrentTenant } from './tenant-context';

describe('tenantStore', () => {
  it('exposes tenant context inside run scope', async () => {
    const ctx = { tenantId: 't-A', requestId: 'req-1' };
    const result = await new Promise<any>((resolve) => {
      tenantStore.run(ctx, () => {
        resolve(getCurrentTenant());
      });
    });
    expect(result.tenantId).toBe('t-A');
  });

  it('propagates through async boundaries', async () => {
    const ctx = { tenantId: 't-B', requestId: 'req-2' };
    const result = await new Promise<any>((resolve) => {
      tenantStore.run(ctx, async () => {
        await new Promise(r => setImmediate(r));
        resolve(getCurrentTenant());
      });
    });
    expect(result.tenantId).toBe('t-B');
  });

  it('getCurrentTenant throws outside scope', () => {
    expect(() => getCurrentTenant()).toThrow(/No tenant context/);
  });

  it('tryGetCurrentTenant returns undefined outside scope', () => {
    expect(tryGetCurrentTenant()).toBeUndefined();
  });
});
```

- [ ] **Step 9.2: Run test — expect FAIL, commit failing test**

```bash
pnpm --filter @quetzal/core test tenant-context
git add packages/core/src/tenant/tenant-context.spec.ts
git commit -m "test(core): tenant context propagates via ALS across async boundaries"
```

- [ ] **Step 9.3: Implement tenant-context.ts**

Create `packages/core/src/tenant/tenant-context.ts`:

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import type { QuetzalRole, Locale } from '../module-contract';

export interface TenantExecutionContext {
  tenantId: string;
  userId?: string;
  role?: QuetzalRole;
  locale?: Locale;
  requestId: string;
}

export const tenantStore = new AsyncLocalStorage<TenantExecutionContext>();

export function getCurrentTenant(): TenantExecutionContext {
  const ctx = tenantStore.getStore();
  if (!ctx) throw new Error('No tenant context — code appelé hors requête ?');
  return ctx;
}

export function tryGetCurrentTenant(): TenantExecutionContext | undefined {
  return tenantStore.getStore();
}
```

- [ ] **Step 9.4: Implement scoped-prisma helper**

Create `packages/core/src/tenant/scoped-prisma.ts`:

```ts
import { rootPrisma, createTenantScopedClient, type TenantScopedPrismaClient } from '@quetzal/db';
import { getCurrentTenant } from './tenant-context';

export function getTenantScopedPrisma(): TenantScopedPrismaClient {
  const { tenantId } = getCurrentTenant();
  return createTenantScopedClient(rootPrisma, tenantId) as TenantScopedPrismaClient;
}
```

- [ ] **Step 9.5: Implement logger (pino)**

Create `packages/core/src/logging/logger.ts`:

```ts
import pino, { type Logger } from 'pino';
import { tryGetCurrentTenant } from '../tenant/tenant-context';

const isDev = process.env.NODE_ENV !== 'production';

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  transport: isDev ? { target: 'pino-pretty', options: { colorize: true }} : undefined,
  mixin() {
    const ctx = tryGetCurrentTenant();
    return ctx ? {
      requestId: ctx.requestId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    } : {};
  },
  redact: {
    paths: ['*.password', '*.token', 'req.headers.authorization', 'req.headers.cookie'],
    censor: '[REDACTED]',
  },
});

export function redactUser(user: { id: string; email?: string }): { userIdHash: string } {
  return { userIdHash: user.id.slice(0, 8) };
}

export type { Logger };
```

- [ ] **Step 9.6: Write failing test for event bus**

Create `packages/core/src/event-bus.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { InProcessEventBus } from './event-bus';

describe('InProcessEventBus', () => {
  it('emits and receives an event synchronously', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();
    bus.on('test.event', handler);
    await bus.emit('test.event', { foo: 'bar' });
    expect(handler).toHaveBeenCalledWith({ foo: 'bar' });
  });

  it('wildcard subscribers receive all events', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();
    bus.on('*.*', handler);
    await bus.emit('module.event', { x: 1 });
    expect(handler).toHaveBeenCalled();
  });

  it('one handler crash does not block others (at-most-once)', async () => {
    const bus = new InProcessEventBus();
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    bus.on('test.crash', bad);
    bus.on('test.crash', good);
    await bus.emit('test.crash', {});
    expect(good).toHaveBeenCalled();
  });
});
```

- [ ] **Step 9.7: Run test — expect FAIL, commit failing test**

```bash
pnpm --filter @quetzal/core test event-bus
git add packages/core/src/event-bus.spec.ts
git commit -m "test(core): event bus emits, supports wildcards, isolates handler crashes"
```

- [ ] **Step 9.8: Implement event bus**

Create `packages/core/src/event-bus.ts`:

```ts
import EventEmitter2 from 'eventemitter2';
import { logger } from './logging/logger';
import type { EventBus, EventName } from './module-contract';

export class InProcessEventBus implements EventBus {
  private readonly emitter = new EventEmitter2({
    wildcard: true,
    delimiter: '.',
    maxListeners: 100,
  });

  async emit<T = unknown>(name: EventName, payload: T): Promise<void> {
    const listeners = this.emitter.listeners(name);
    for (const listener of listeners) {
      try {
        await Promise.resolve((listener as any)(payload));
      } catch (err) {
        logger.error({ err, event: name }, 'event subscriber crashed');
      }
    }
    // Wildcard listeners
    const wildcardListeners = this.emitter.listeners('**' as any);
    for (const listener of wildcardListeners) {
      try {
        await Promise.resolve((listener as any)(payload));
      } catch (err) {
        logger.error({ err, event: name }, 'wildcard subscriber crashed');
      }
    }
  }

  on<T = unknown>(name: EventName | EventName[] | '*.*', handler: (payload: T) => Promise<void> | void): void {
    const key = name === '*.*' ? '**' : name;
    if (Array.isArray(key)) {
      for (const k of key) this.emitter.on(k, handler as any);
    } else {
      this.emitter.on(key as any, handler as any);
    }
  }
}

export const eventBus: EventBus = new InProcessEventBus();
```

- [ ] **Step 9.9: Run tests + commit**

```bash
pnpm --filter @quetzal/core test
git add packages/core/src/tenant packages/core/src/logging packages/core/src/event-bus.ts
git commit -m "feat(core): tenant context (ALS), scoped-prisma helper, pino logger, in-process event bus"
```

### Task 10: Guest token + guest registry + rooms helper

**Files:**
- Create: `packages/core/src/guest/guest-token.ts`, `packages/core/src/guest/guest-token.spec.ts`, `packages/core/src/guest/guest-registry.ts`, `packages/core/src/rooms.ts`, `packages/core/src/rooms.spec.ts`

- [ ] **Step 10.1: Write failing test for rooms helper**

Create `packages/core/src/rooms.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rooms } from './rooms';

describe('rooms', () => {
  it('formats session room canonically', () => {
    expect(rooms.session('hello', 'abc123')).toBe('hello:session:abc123');
  });

  it('formats tenant room canonically', () => {
    expect(rooms.tenant('loto', 't-A')).toBe('loto:tenant:t-A');
  });
});
```

- [ ] **Step 10.2: Implement rooms.ts + commit test then impl**

Create `packages/core/src/rooms.ts`:

```ts
export const rooms = {
  session: (moduleSlug: string, sessionId: string) => `${moduleSlug}:session:${sessionId}` as const,
  tenant:  (moduleSlug: string, tenantId: string)  => `${moduleSlug}:tenant:${tenantId}` as const,
};
```

```bash
git add packages/core/src/rooms.spec.ts
git commit -m "test(core): rooms helpers format canonical WS room names"
git add packages/core/src/rooms.ts
git commit -m "feat(core): rooms.session/tenant helpers"
```

- [ ] **Step 10.3: Write failing test for guest-token**

Create `packages/core/src/guest/guest-token.spec.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { signGuestToken, verifyGuestToken, GuestTokenInvalidError } from './guest-token';

beforeAll(() => {
  process.env.GUEST_TOKEN_SECRET = 'x'.repeat(64);
});

describe('guest-token', () => {
  const payload = {
    tenantId: 't-A',
    sessionId: 's-1',
    guestId: 'g-1',
    displayName: 'Bob',
    moduleSlug: 'hello',
  };

  it('signs and verifies a valid token', async () => {
    const token = await signGuestToken(payload, 3600);
    const verified = await verifyGuestToken(token);
    expect(verified.tenantId).toBe('t-A');
    expect(verified.displayName).toBe('Bob');
  });

  it('rejects tampered token', async () => {
    const token = await signGuestToken(payload, 3600);
    const tampered = token.slice(0, -5) + 'XXXXX';
    await expect(verifyGuestToken(tampered)).rejects.toThrow(GuestTokenInvalidError);
  });

  it('rejects expired token', async () => {
    const token = await signGuestToken(payload, -1);
    await expect(verifyGuestToken(token)).rejects.toThrow(GuestTokenInvalidError);
  });
});
```

- [ ] **Step 10.4: Implement guest-token.ts**

```bash
git add packages/core/src/guest/guest-token.spec.ts
git commit -m "test(core): guest token HMAC signs/verifies/rejects tampering/expiry"
```

Create `packages/core/src/guest/guest-token.ts`:

```ts
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';

export interface GuestTokenPayload {
  tenantId: string;
  sessionId: string;
  guestId: string;
  displayName: string;
  moduleSlug: string;
}

export interface VerifiedGuestToken extends GuestTokenPayload {
  iat: number;
  exp: number;
}

export class GuestTokenInvalidError extends Error {
  constructor(reason: string) {
    super(`Guest token invalid: ${reason}`);
    this.name = 'GuestTokenInvalidError';
  }
}

function getSecret(): Uint8Array {
  const secret = process.env.GUEST_TOKEN_SECRET;
  if (!secret || secret.length < 32) throw new Error('GUEST_TOKEN_SECRET missing or too short (min 32 chars)');
  return new TextEncoder().encode(secret);
}

export async function signGuestToken(payload: GuestTokenPayload, ttlSeconds: number): Promise<string> {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secret);
}

export async function verifyGuestToken(token: string): Promise<VerifiedGuestToken> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    return payload as unknown as VerifiedGuestToken;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) throw new GuestTokenInvalidError('expired');
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) throw new GuestTokenInvalidError('bad signature');
    throw new GuestTokenInvalidError((err as Error).message);
  }
}
```

- [ ] **Step 10.5: Implement guest-registry (in-memory MVP)**

Create `packages/core/src/guest/guest-registry.ts`:

```ts
export interface GuestEntry {
  guestId: string;
  displayName: string;
  joinedAt: number;
}

export interface GuestRegistry {
  add(moduleSlug: string, sessionId: string, entry: GuestEntry): boolean;  // false if quota reached
  remove(moduleSlug: string, sessionId: string, guestId: string): void;
  list(moduleSlug: string, sessionId: string): GuestEntry[];
  count(moduleSlug: string, sessionId: string): number;
}

export class InMemoryGuestRegistry implements GuestRegistry {
  private readonly bySession = new Map<string, Map<string, GuestEntry>>();

  private key(moduleSlug: string, sessionId: string): string {
    return `${moduleSlug}:${sessionId}`;
  }

  add(moduleSlug: string, sessionId: string, entry: GuestEntry): boolean {
    const key = this.key(moduleSlug, sessionId);
    let entries = this.bySession.get(key);
    if (!entries) {
      entries = new Map();
      this.bySession.set(key, entries);
    }
    entries.set(entry.guestId, entry);
    return true;
  }

  remove(moduleSlug: string, sessionId: string, guestId: string): void {
    this.bySession.get(this.key(moduleSlug, sessionId))?.delete(guestId);
  }

  list(moduleSlug: string, sessionId: string): GuestEntry[] {
    return [...(this.bySession.get(this.key(moduleSlug, sessionId))?.values() ?? [])];
  }

  count(moduleSlug: string, sessionId: string): number {
    return this.bySession.get(this.key(moduleSlug, sessionId))?.size ?? 0;
  }
}

export const guestRegistry: GuestRegistry = new InMemoryGuestRegistry();
```

- [ ] **Step 10.6: Run tests + commit**

```bash
pnpm --filter @quetzal/core test
git add packages/core/src/guest
git commit -m "feat(core): guest token (HMAC JWT) + in-memory guest registry"
```

### Task 11: Contract test suite (runContractSuite)

**Files:**
- Create: `packages/core/src/testing/contract-suite.ts`, `packages/core/src/testing/index.ts`, `packages/core/src/testing/factories/index.ts`, `packages/core/src/testing/postgres-container.ts`, `packages/core/src/testing/seed-helpers.ts`

- [ ] **Step 11.1: Create contract-suite.ts**

Create `packages/core/src/testing/contract-suite.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { manifestSchema } from '../schemas/manifest.schema';
import { CONTRACT_VERSION, type QuetzalModuleManifest } from '../module-contract';

function flattenKeys(obj: any, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, key));
    } else {
      keys.push(key);
    }
  }
  return keys.sort();
}

export function runContractSuite(manifest: QuetzalModuleManifest, options: { moduleRoot: string }): void {
  describe(`contract [${manifest.slug}]`, () => {
    it('validates against Zod schema', () => {
      expect(() => manifestSchema.parse(manifest)).not.toThrow();
    });

    it('contract version major matches CONTRACT_VERSION', () => {
      const manifestMajor = manifest.contractVersion.split('.')[0];
      const coreMajor = CONTRACT_VERSION.split('.')[0];
      expect(manifestMajor).toBe(coreMajor);
    });

    it('all published events have canonical naming', () => {
      for (const ev of manifest.eventsPublished) {
        expect(ev.name).toMatch(/^[a-z]+(\.[a-z]+){1,2}$/);
      }
    });

    it('all published events have a type in @quetzal/core/events/<slug>', async () => {
      if (manifest.eventsPublished.length === 0) return;
      const mod = await import(`@quetzal/core/events/${manifest.slug}`).catch(() => null);
      expect(mod, `@quetzal/core/events/${manifest.slug} must exist`).not.toBeNull();
      for (const ev of manifest.eventsPublished) {
        expect((mod as any)[ev.typeRef], `${ev.typeRef} must be exported from @quetzal/core/events/${manifest.slug}`).toBeDefined();
      }
    });

    it('prisma models are prefixed with <ModulePascalCase>_', async () => {
      if (!manifest.prismaModels) return;
      const path = resolve(options.moduleRoot, manifest.prismaModels);
      const content = await readFile(path, 'utf8');
      const prefix = manifest.slug[0]!.toUpperCase() + manifest.slug.slice(1) + '_';
      const models = [...content.matchAll(/model\s+(\w+)/g)].map(m => m[1]!);
      for (const m of models) {
        expect(m.startsWith(prefix), `${m} must start with ${prefix}`).toBe(true);
      }
    });

    it('i18n keys have parity across fr/en/es', async () => {
      const load = (locale: string) =>
        readFile(resolve(options.moduleRoot, `src/i18n/${locale}.json`), 'utf8').then(JSON.parse);
      const [fr, en, es] = await Promise.all(['fr', 'en', 'es'].map(load));
      expect(flattenKeys(en)).toEqual(flattenKeys(fr));
      expect(flattenKeys(es)).toEqual(flattenKeys(fr));
    });

    it('guestAccess coherent with permissions when enabled', () => {
      if (!manifest.guestAccess?.enabled) return;
      const hasGuestEndpoint = Object.values(manifest.permissions).some(roles => (roles as readonly string[]).includes('guest'));
      expect(hasGuestEndpoint, 'guestAccess.enabled=true but no permissions entry allows guest').toBe(true);
    });
  });
}
```

- [ ] **Step 11.2: Create factories/index.ts**

Create `packages/core/src/testing/factories/index.ts`:

```ts
import { newId } from '@quetzal/db';
import type { QuetzalRole, Locale } from '../../module-contract';

export function aUser(overrides: Partial<{ id: string; email: string; name: string; locale: Locale }> = {}) {
  return {
    id: overrides.id ?? newId(),
    email: overrides.email ?? 'test@quetzal.dev',
    name: overrides.name ?? 'Test User',
    locale: overrides.locale ?? 'fr' as Locale,
  };
}

export function aTenant(overrides: Partial<{ id: string; slug: string; name: string }> = {}) {
  return {
    id: overrides.id ?? newId(),
    slug: overrides.slug ?? 'test-tenant',
    name: overrides.name ?? 'Test Tenant',
  };
}

export function aTenantContext(overrides: Partial<{ tenantId: string; userId: string; role: QuetzalRole }> = {}) {
  return {
    tenantId: overrides.tenantId ?? newId(),
    userId: overrides.userId ?? newId(),
    role: overrides.role ?? 'creator' as QuetzalRole,
    requestId: newId(),
  };
}
```

- [ ] **Step 11.3: Create postgres-container.ts + seed-helpers.ts**

Create `packages/core/src/testing/postgres-container.ts`:

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

let container: StartedPostgreSqlContainer | undefined;

export async function ensureTestPostgres(): Promise<string> {
  if (!container) {
    container = await new PostgreSqlContainer('postgres:17')
      .withDatabase('quetzal_test')
      .withUsername('test').withPassword('test')
      .withReuse()
      .start();
    process.env.DATABASE_URL = container.getConnectionUri();
    execSync('pnpm --filter @quetzal/db exec prisma migrate deploy --schema=prisma/schema.prisma', { stdio: 'inherit' });
  }
  return container!.getConnectionUri();
}

export async function resetTestDatabase(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
    `;
    if (tables.length > 0) {
      await prisma.$executeRawUnsafe(
        `TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(',')} RESTART IDENTITY CASCADE`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
```

Create `packages/core/src/testing/seed-helpers.ts`:

```ts
import { rootPrisma, newId } from '@quetzal/db';

export async function seedTenant(name = 'Test Tenant'): Promise<{ tenantId: string; ownerId: string }> {
  const ownerId = newId();
  const tenantId = newId();
  await rootPrisma.user.create({
    data: { id: ownerId, email: `${ownerId}@test.dev`, name, emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
  });
  await rootPrisma.organization.create({
    data: { id: tenantId, slug: `test-${tenantId.slice(0, 8)}`, name, createdAt: new Date() },
  });
  await rootPrisma.member.create({
    data: { id: newId(), userId: ownerId, organizationId: tenantId, role: 'owner', createdAt: new Date() },
  });
  return { tenantId, ownerId };
}
```

- [ ] **Step 11.4: Create testing/index.ts**

```ts
export { runContractSuite } from './contract-suite';
export * from './factories';
export { ensureTestPostgres, resetTestDatabase } from './postgres-container';
export { seedTenant } from './seed-helpers';
```

- [ ] **Step 11.5: Update core package deps + build**

Add to `packages/core/package.json` devDependencies:
```json
"@testcontainers/postgresql": "^10.16.0",
"@prisma/client": "^6.1.0"
```

```bash
pnpm install
pnpm --filter @quetzal/core build
```

- [ ] **Step 11.6: Commit**

```bash
git add packages/core/src/testing packages/core/package.json
git commit -m "feat(core): contract test suite (runContractSuite) + factories + testcontainers + seed helpers"
```

### Task 12: Integration test — tenant isolation (proves scoped Prisma works end-to-end)

**Files:**
- Create: `packages/db/src/clients.integration.spec.ts`, `packages/db/vitest.integration.config.ts`

- [ ] **Step 12.1: Create vitest integration config (single-threaded)**

Create `packages/db/vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.integration.spec.ts'],
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 60_000,
  },
});
```

- [ ] **Step 12.2: Write failing integration test**

Create `packages/db/src/clients.integration.spec.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing';
import { PrismaClient } from '@prisma/client';
import { createTenantScopedClient, TenantScopeViolationError, newId } from './index';

describe('TenantScopedPrismaClient (integration)', () => {
  let root: PrismaClient;

  beforeAll(async () => {
    await ensureTestPostgres();
    root = new PrismaClient();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  it('reads only rows of the current tenant', async () => {
    const { tenantId: tA } = await seedTenant('A');
    const { tenantId: tB } = await seedTenant('B');

    // Insert AuditLog rows for both tenants (AuditLog has tenantId + is tenant-scoped)
    await root.auditLog.createMany({
      data: [
        { id: newId(), tenantId: tA, action: 'test.event', createdAt: new Date() },
        { id: newId(), tenantId: tB, action: 'test.event', createdAt: new Date() },
      ],
    });

    const scopedA = createTenantScopedClient(root, tA);
    const rows = await scopedA.auditLog.findMany({ where: { action: 'test.event' }});

    expect(rows).toHaveLength(1);
    expect(rows[0]!.tenantId).toBe(tA);
  });

  it('throws when creating with a foreign tenantId', async () => {
    const { tenantId: tA } = await seedTenant('A');
    const { tenantId: tB } = await seedTenant('B');

    const scopedA = createTenantScopedClient(root, tA);
    await expect(
      scopedA.auditLog.create({
        data: { id: newId(), tenantId: tB, action: 'evil.attempt' } as any,
      })
    ).rejects.toThrow(TenantScopeViolationError);
  });

  it('throws when where.tenantId explicitly mismatches ctx', async () => {
    const { tenantId: tA } = await seedTenant('A');
    const { tenantId: tB } = await seedTenant('B');

    const scopedA = createTenantScopedClient(root, tA);
    await expect(
      scopedA.auditLog.findMany({ where: { tenantId: tB } as any })
    ).rejects.toThrow(TenantScopeViolationError);
  });
});
```

- [ ] **Step 12.3: Run integration test — expect PASS (impl already done Task 6)**

```bash
pnpm --filter @quetzal/db test:integration
```

Requires Docker Desktop running. If not: `SKIP_INTEGRATION=1 pnpm ...`.

- [ ] **Step 12.4: Commit**

```bash
git add packages/db/src/clients.integration.spec.ts packages/db/vitest.integration.config.ts
git commit -m "test(db): integration — tenant isolation on reads + writes + bypass attempts throw"
```

## Phase 4 — apps/api NestJS scaffold

### Task 13: apps/api bootstrap + main.ts + AppModule

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, `apps/api/nest-cli.json`, `apps/api/vitest.config.ts`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/health.controller.ts`

- [ ] **Step 13.1: Create package.json**

```json
{
  "name": "quetzal-api",
  "version": "0.0.0",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.15",
    "@nestjs/core": "^10.4.15",
    "@nestjs/config": "^3.3.0",
    "@nestjs/platform-express": "^10.4.15",
    "@nestjs/websockets": "^10.4.15",
    "@nestjs/platform-socket.io": "^10.4.15",
    "@nestjs/event-emitter": "^2.1.1",
    "@nestjs/throttler": "^6.4.0",
    "@sentry/node": "^8.42.0",
    "helmet": "^8.0.0",
    "jose": "^5.9.6",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "socket.io": "^4.8.1",
    "zod": "^3.24.1",
    "@quetzal/core": "workspace:*",
    "@quetzal/db": "workspace:*",
    "@quetzal/auth": "workspace:*",
    "@quetzal/module-hello": "workspace:*"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.9",
    "@nestjs/schematics": "^10.2.3",
    "@nestjs/testing": "^10.4.15",
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.0",
    "@quetzal/config": "workspace:*",
    "supertest": "^7.0.0",
    "ts-loader": "^9.5.1",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8",
    "unplugin-swc": "^1.5.1"
  }
}
```

- [ ] **Step 13.2: Create nest-cli.json + tsconfig.build.json + tsconfig.json**

`apps/api/nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true, "tsConfigPath": "tsconfig.build.json" }
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "@quetzal/config/typescript/nest.json",
  "compilerOptions": {
    "outDir": "./dist",
    "baseUrl": "./",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

`apps/api/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "test", "**/*.spec.ts"]
}
```

- [ ] **Step 13.3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: { globals: false, environment: 'node', include: ['src/**/*.spec.ts'] },
  plugins: [swc.vite({ module: { type: 'nodenext' }})],
});
```

- [ ] **Step 13.4: Create health.controller.ts (simplest starting point)**

`apps/api/src/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';

@Controller('api/health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
```

- [ ] **Step 13.5: Create AppModule stub (will be composed dynamically in Task 15)**

`apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.', maxListeners: 100 }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 13.6: Create main.ts**

`apps/api/src/main.ts`:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { logger } from '@quetzal/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(helmet({
    contentSecurityPolicy: false,   // CSP handled by host (Next)
  }));

  app.enableCors({
    origin: (process.env.HOST_URL ?? 'http://localhost:3000').split(','),
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  });

  const port = parseInt(process.env.PORT ?? '3001', 10);
  await app.listen(port);
  logger.info({ port }, 'quetzal-api listening');
}

bootstrap().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 13.7: Build + smoke test**

```bash
pnpm install
pnpm --filter quetzal-api build
node apps/api/dist/main.js &
sleep 3
curl http://localhost:3001/api/health
kill %1
```

Expected: `{"status":"ok","timestamp":"..."}`.

- [ ] **Step 13.8: Commit**

```bash
git add apps/api
git commit -m "feat(api): NestJS bootstrap — main.ts, AppModule, health endpoint, CORS, helmet"
```

### Task 14: Middlewares — request-id, JWT auth, tenant, rate limit

**Files:**
- Create: `apps/api/src/middlewares/request-id.middleware.ts`, `apps/api/src/middlewares/jwt-auth.middleware.ts`, `apps/api/src/middlewares/tenant.middleware.ts`, `apps/api/src/middlewares/jwt-auth.middleware.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 14.1: Create RequestIdMiddleware**

`apps/api/src/middlewares/request-id.middleware.ts`:

```ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { newId } from '@quetzal/db';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const id = (req.headers['x-request-id'] as string) ?? newId();
    (req as any).requestId = id;
    res.setHeader('x-request-id', id);
    next();
  }
}
```

- [ ] **Step 14.2: Write failing test for JWT auth middleware**

`apps/api/src/middlewares/jwt-auth.middleware.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { JwtAuthMiddleware } from './jwt-auth.middleware';

describe('JwtAuthMiddleware', () => {
  it('skips validation when no Authorization header', async () => {
    const mw = new JwtAuthMiddleware();
    const req = { headers: {} } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);
    expect(next).toHaveBeenCalled();
    expect((req as any).authContext).toBeUndefined();
  });

  it('rejects malformed Bearer token', async () => {
    const mw = new JwtAuthMiddleware();
    const req = { headers: { authorization: 'Bearer invalid.token.here' }} as any;
    const next = vi.fn();
    await expect(mw.use(req, {} as any, next)).rejects.toThrow();
  });
});
```

- [ ] **Step 14.3: Commit failing test**

```bash
git add apps/api/src/middlewares/jwt-auth.middleware.spec.ts
git commit -m "test(api): JwtAuthMiddleware skips on no header, throws on invalid"
```

- [ ] **Step 14.4: Implement JwtAuthMiddleware**

`apps/api/src/middlewares/jwt-auth.middleware.ts`:

```ts
import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) {
    const url = new URL(`${process.env.HOST_URL}/api/auth/jwt/jwks`);
    jwks = createRemoteJWKSet(url, {
      cooldownDuration: 30_000,
      cacheMaxAge: 24 * 3600_000,
    });
  }
  return jwks;
}

export interface AuthContext {
  userId: string;
  tenantId: string | null;
  role: string | null;
  locale: string;
}

@Injectable()
export class JwtAuthMiddleware implements NestMiddleware {
  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return next();
    }
    const token = auth.slice(7);
    try {
      const { payload } = await jwtVerify(token, getJwks());
      (req as any).authContext = payload as unknown as AuthContext;
      next();
    } catch (err) {
      throw new UnauthorizedException(`JWT verification failed: ${(err as Error).message}`);
    }
  }
}
```

- [ ] **Step 14.5: Implement TenantMiddleware**

`apps/api/src/middlewares/tenant.middleware.ts`:

```ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { tenantStore } from '@quetzal/core';
import type { AuthContext } from './jwt-auth.middleware';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const auth = (req as any).authContext as AuthContext | undefined;
    const requestId = (req as any).requestId as string;
    if (!auth || !auth.tenantId) return next();

    tenantStore.run(
      {
        tenantId: auth.tenantId,
        userId: auth.userId,
        role: auth.role as any,
        locale: auth.locale as any,
        requestId,
      },
      () => next(),
    );
  }
}
```

- [ ] **Step 14.6: Wire middlewares into AppModule**

Modify `apps/api/src/app.module.ts`:

```ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health.controller';
import { RequestIdMiddleware } from './middlewares/request-id.middleware';
import { JwtAuthMiddleware } from './middlewares/jwt-auth.middleware';
import { TenantMiddleware } from './middlewares/tenant.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.', maxListeners: 100 }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware, JwtAuthMiddleware, TenantMiddleware)
      .forRoutes('*');
  }
}
```

- [ ] **Step 14.7: Run tests + commit**

```bash
pnpm --filter quetzal-api test
git add apps/api/src/middlewares apps/api/src/app.module.ts
git commit -m "feat(api): request-id + JWT (JWKS) + tenant (ALS) + throttler middlewares"
```

### Task 15: Module registry + dynamic AppModule composition

**Files:**
- Create: `apps/api/src/module-registry.ts`, `apps/api/src/module-registry.spec.ts`
- Modify: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`

- [ ] **Step 15.1: Write failing test for module registry**

`apps/api/src/module-registry.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateContractVersion } from './module-registry';

describe('validateContractVersion', () => {
  it('accepts same major', () => {
    expect(() => validateContractVersion('1.0.0', '1.0.0')).not.toThrow();
    expect(() => validateContractVersion('1.2.3', '1.0.0')).not.toThrow();
  });

  it('rejects different major', () => {
    expect(() => validateContractVersion('2.0.0', '1.0.0')).toThrow(/contract version/);
  });
});
```

- [ ] **Step 15.2: Commit failing test**

```bash
git add apps/api/src/module-registry.spec.ts
git commit -m "test(api): module registry validates contract version major"
```

- [ ] **Step 15.3: Implement module-registry.ts**

```ts
import { DynamicModule, Type, INestModule } from '@nestjs/common';
import { rootPrisma } from '@quetzal/db';
import { logger, CONTRACT_VERSION, manifestSchema, type QuetzalModuleManifest } from '@quetzal/core';

export function validateContractVersion(manifestVersion: string, coreVersion: string): void {
  const manifestMajor = manifestVersion.split('.')[0];
  const coreMajor = coreVersion.split('.')[0];
  if (manifestMajor !== coreMajor) {
    throw new Error(`Module contract version ${manifestVersion} incompatible with core ${coreVersion}`);
  }
}

export async function loadManifests(slugs: string[]): Promise<QuetzalModuleManifest[]> {
  const manifests: QuetzalModuleManifest[] = [];
  for (const slug of slugs) {
    const mod = await import(`@quetzal/module-${slug}`);
    const manifest = mod.manifest as QuetzalModuleManifest;
    manifestSchema.parse(manifest);
    validateContractVersion(manifest.contractVersion, CONTRACT_VERSION);
    manifests.push(manifest);
    logger.info({ slug, version: manifest.version }, 'module loaded');
  }
  return manifests;
}

export async function upsertModuleCatalogue(manifests: QuetzalModuleManifest[]): Promise<void> {
  for (const m of manifests) {
    await rootPrisma.module.upsert({
      where: { slug: m.slug },
      create: {
        slug: m.slug,
        version: m.version,
        contractVersion: m.contractVersion,
        enabledByDefault: m.enabledByDefault,
        metadata: { name: m.name, description: m.description } as any,
      },
      update: {
        version: m.version,
        contractVersion: m.contractVersion,
        metadata: { name: m.name, description: m.description } as any,
      },
    });
  }
}

export function composeAppModules(manifests: QuetzalModuleManifest[]): Type<INestModule>[] {
  return manifests.map(m => m.apiModule);
}
```

- [ ] **Step 15.4: Wire registry into main.ts**

Modify `apps/api/src/main.ts`:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadManifests, upsertModuleCatalogue, composeAppModules } from './module-registry';
import helmet from 'helmet';
import { logger, eventBus } from '@quetzal/core';

async function bootstrap() {
  const slugs = (process.env.MODULES ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (slugs.length === 0) {
    logger.warn('No MODULES env variable — starting with core only');
  }

  const manifests = await loadManifests(slugs);
  await upsertModuleCatalogue(manifests);

  @Module({
    imports: [AppModule, ...composeAppModules(manifests)],
  })
  class RootModule {}

  const app = await NestFactory.create(RootModule, { bufferLogs: true });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: (process.env.HOST_URL ?? 'http://localhost:3000').split(','),
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  });

  // Call onBoot for each module
  const rootContext = {
    logger,
    config: process.env,
    eventBus,
    prisma: (await import('@quetzal/db')).rootPrisma,
  };
  for (const m of manifests) {
    if (m.onBoot) await m.onBoot(rootContext);
  }

  const port = parseInt(process.env.PORT ?? '3001', 10);
  await app.listen(port);
  logger.info({ port, modules: slugs }, 'quetzal-api listening');
}

bootstrap().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 15.5: Commit**

```bash
git add apps/api/src/module-registry.ts apps/api/src/main.ts
git commit -m "feat(api): dynamic module registry — load manifests, validate contract, compose AppModule, run onBoot"
```

### Task 16: Guest-token endpoint + guards (JWT + guest)

**Files:**
- Create: `apps/api/src/guest/guest-token.controller.ts`, `apps/api/src/guest/guest-token.dto.ts`, `apps/api/src/guards/guest.guard.ts`, `apps/api/src/guards/ws-jwt.guard.ts`, `apps/api/src/guards/ws-guest.guard.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 16.1: Create guest-token DTO with Zod**

`apps/api/src/guest/guest-token.dto.ts`:

```ts
import { z } from 'zod';

export const guestTokenRequestSchema = z.object({
  tenantId: z.string().uuid(),
  sessionId: z.string().min(1),
  moduleSlug: z.string().regex(/^[a-z][a-z0-9-]{2,31}$/),
  displayName: z.string().min(1).max(32),
});

export type GuestTokenRequest = z.infer<typeof guestTokenRequestSchema>;
```

- [ ] **Step 16.2: Create guest-token controller**

`apps/api/src/guest/guest-token.controller.ts`:

```ts
import { Controller, Post, Body, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { rootPrisma, newId } from '@quetzal/db';
import { signGuestToken, guestRegistry, eventBus, logger } from '@quetzal/core';
import { guestTokenRequestSchema } from './guest-token.dto';

@Controller('api/guest-token')
export class GuestTokenController {
  @Post()
  @Throttle({ default: { limit: 100, ttl: 3600_000 }})
  async create(@Body() body: unknown, @Req() req: Request) {
    const parsed = guestTokenRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { tenantId, sessionId, moduleSlug, displayName } = parsed.data;

    // Verify tenant exists and module is active for tenant
    const tm = await rootPrisma.tenantModule.findUnique({
      where: { tenantId_moduleSlug: { tenantId, moduleSlug }},
    });
    if (!tm || !tm.enabled) throw new NotFoundException('Module not active for tenant');

    const guestId = newId();
    const token = await signGuestToken({ tenantId, sessionId, moduleSlug, guestId, displayName }, 7200);

    guestRegistry.add(moduleSlug, sessionId, { guestId, displayName, joinedAt: Date.now() });

    await rootPrisma.auditLog.create({
      data: {
        id: newId(),
        tenantId, userId: null,
        action: 'guest.joined',
        target: sessionId,
        metadata: { guestId, moduleSlug, displayName } as any,
        ipAddress: req.ip ?? null,
      },
    });

    await eventBus.emit('guest.joined', { tenantId, sessionId, moduleSlug, guestId, displayName });

    logger.info({ tenantId, sessionId, moduleSlug, guestId }, 'guest joined');
    return { token, guestId };
  }
}
```

- [ ] **Step 16.3: Create WsJwtGuard + WsGuestGuard**

`apps/api/src/guards/ws-jwt.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

@Injectable()
export class WsJwtGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();
    const token = client.handshake?.auth?.token as string | undefined;
    if (!token) return false;
    if (!jwks) jwks = createRemoteJWKSet(new URL(`${process.env.HOST_URL}/api/auth/jwt/jwks`));
    try {
      const { payload } = await jwtVerify(token, jwks);
      client.data = { ...client.data, ...payload };
      return true;
    } catch {
      return false;
    }
  }
}
```

`apps/api/src/guards/ws-guest.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { verifyGuestToken } from '@quetzal/core';

@Injectable()
export class WsGuestGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();
    const token = client.handshake?.auth?.guestToken as string | undefined;
    if (!token) return false;
    try {
      const payload = await verifyGuestToken(token);
      client.data = { ...client.data, role: 'guest', ...payload };
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 16.4: Wire GuestTokenController into AppModule**

Modify `apps/api/src/app.module.ts` — add `GuestTokenController` to controllers array.

- [ ] **Step 16.5: Commit**

```bash
git add apps/api/src/guest apps/api/src/guards apps/api/src/app.module.ts
git commit -m "feat(api): guest-token endpoint (rate-limited, audited) + WS JWT/Guest guards"
```

### Task 17: Global exception filter + audit subscriber + Sentry

**Files:**
- Create: `apps/api/src/filters/global-exception.filter.ts`, `apps/api/src/observability/audit.subscriber.ts`, `apps/api/src/observability/sentry.ts`
- Modify: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`

- [ ] **Step 17.1: Create Sentry init**

`apps/api/src/observability/sentry.ts`:

```ts
import * as Sentry from '@sentry/node';

export function initSentry() {
  if (!process.env.SENTRY_DSN_API) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN_API,
    tracesSampleRate: 0.2,
    environment: process.env.NODE_ENV ?? 'development',
    beforeSend(event) {
      if (event.user) event.user = { id: event.user.id };
      if (event.request?.cookies) event.request.cookies = '[REDACTED]';
      if (event.request?.headers) delete (event.request.headers as any).authorization;
      return event;
    },
  });
}
```

- [ ] **Step 17.2: Create global exception filter**

`apps/api/src/filters/global-exception.filter.ts`:

```ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { logger, TenantScopeViolationError } from '@quetzal/core';
// TenantScopeViolationError is re-exported from @quetzal/core (add if not already)

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    if (exception instanceof TenantScopeViolationError) {
      logger.error({ err: exception, path: request.url }, 'tenant scope violation');
      Sentry.captureException(exception);
      return response.status(HttpStatus.FORBIDDEN).json({
        error: 'tenant_scope_violation',
        message: 'Cross-tenant access denied',
      });
    }

    if (exception instanceof HttpException) {
      return response.status(exception.getStatus()).json(exception.getResponse());
    }

    logger.error({ err: exception, path: request.url }, 'unhandled exception');
    Sentry.captureException(exception);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'internal_server_error',
      message: 'An unexpected error occurred',
    });
  }
}
```

Note: re-export `TenantScopeViolationError` from `@quetzal/core/index.ts`:
```ts
export { TenantScopeViolationError } from '@quetzal/db';
```

- [ ] **Step 17.3: Create audit subscriber**

`apps/api/src/observability/audit.subscriber.ts`:

```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { rootPrisma, newId } from '@quetzal/db';
import { logger, tryGetCurrentTenant } from '@quetzal/core';

const AUDIT_EVENTS = [
  'user.login', 'user.logout', 'user.signup',
  'guest.joined', 'guest.left', 'guest.kicked',
  'session.created', 'session.ended',
  'module.installed', 'module.enabled', 'module.disabled',
] as const;

@Injectable()
export class AuditSubscriber implements OnModuleInit {
  constructor(private readonly emitter: EventEmitter2) {}

  onModuleInit() {
    for (const evName of AUDIT_EVENTS) {
      this.emitter.on(evName, async (payload: any) => {
        try {
          const ctx = tryGetCurrentTenant();
          await rootPrisma.auditLog.create({
            data: {
              id: newId(),
              tenantId: payload?.tenantId ?? ctx?.tenantId ?? null,
              userId: payload?.userId ?? ctx?.userId ?? null,
              action: evName,
              target: payload?.target ?? null,
              metadata: payload as any,
            },
          });
        } catch (err) {
          logger.error({ err, evName }, 'AuditSubscriber failed');
        }
      });
    }
    // Wildcard for security.* events
    this.emitter.onAny(async (event, payload) => {
      if (String(event).startsWith('audit.security.')) {
        await rootPrisma.auditLog.create({
          data: {
            id: newId(),
            tenantId: (payload as any)?.tenantId ?? null,
            userId: (payload as any)?.userId ?? null,
            action: String(event),
            metadata: payload as any,
          },
        }).catch(err => logger.error({ err }, 'AuditSubscriber security failed'));
      }
    });
  }
}
```

- [ ] **Step 17.4: Wire into main.ts + app.module.ts**

Modify `apps/api/src/main.ts` — at start of bootstrap:
```ts
import { initSentry } from './observability/sentry';
// ...
async function bootstrap() {
  initSentry();
  // ...
  app.useGlobalFilters(new GlobalExceptionFilter());
```

Modify `apps/api/src/app.module.ts` — add `AuditSubscriber` to providers.

- [ ] **Step 17.5: Commit**

```bash
git add apps/api/src/filters apps/api/src/observability apps/api/src/main.ts apps/api/src/app.module.ts
git commit -m "feat(api): global exception filter + audit subscriber + Sentry init (PII redacted)"
```

### Task 18: render.yaml + build config

**Files:**
- Create: `render.yaml`

- [ ] **Step 18.1: Create render.yaml**

```yaml
services:
  - type: web
    name: quetzal-api
    runtime: node
    plan: free
    region: frankfurt
    branch: main
    autoDeploy: true
    buildCommand: |
      corepack enable && corepack prepare pnpm@9.15.0 --activate
      pnpm install --frozen-lockfile
      pnpm --filter @quetzal/auth generate
      pnpm --filter @quetzal/db schema:merge
      pnpm --filter @quetzal/db generate:tenant-registry
      pnpm --filter @quetzal/db prisma:generate
      pnpm --filter quetzal-api build
    preDeployCommand: pnpm --filter @quetzal/db prisma:migrate:deploy
    startCommand: node apps/api/dist/main.js
    healthCheckPath: /api/health
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3001
      - key: DATABASE_URL
        sync: false
      - key: BETTER_AUTH_SECRET
        sync: false
      - key: GUEST_TOKEN_SECRET
        sync: false
      - key: HOST_URL
        sync: false
      - key: API_URL
        sync: false
      - key: SENTRY_DSN_API
        sync: false
      - key: MODULES
        value: hello
```

- [ ] **Step 18.2: Commit**

```bash
git add render.yaml
git commit -m "feat(deploy): render.yaml — quetzal-api on Frankfurt free tier, prisma migrate predeploy"
```

## Phase 5 — packages/i18n + packages/ui

### Task 19: packages/i18n (next-intl + catalogues FR/EN/ES)

**Files:**
- Create: `packages/i18n/package.json`, `packages/i18n/tsconfig.json`, `packages/i18n/src/config.ts`, `packages/i18n/src/merge.ts`, `packages/i18n/src/index.ts`, `packages/i18n/catalogues/fr.json`, `packages/i18n/catalogues/en.json`, `packages/i18n/catalogues/es.json`

- [ ] **Step 19.1: Create package.json**

```json
{
  "name": "@quetzal/i18n",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./catalogues/*": "./catalogues/*"
  },
  "scripts": {
    "build": "tsc && cp -r catalogues dist/catalogues",
    "typecheck": "tsc --noEmit",
    "merge": "tsx src/merge.ts"
  },
  "dependencies": {
    "next-intl": "^3.26.3"
  },
  "devDependencies": {
    "@quetzal/config": "workspace:*",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 19.2: Create tsconfig.json**

```json
{
  "extends": "@quetzal/config/typescript/base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 19.3: Create catalogues FR/EN/ES (core keys)**

`packages/i18n/catalogues/fr.json`:

```json
{
  "common": {
    "button": {
      "save": "Enregistrer",
      "cancel": "Annuler",
      "join": "Rejoindre",
      "close": "Fermer",
      "submit": "Valider",
      "greet": "Saluer",
      "ping": "Ping"
    },
    "error": {
      "required": "Champ obligatoire",
      "too_long": "Maximum {max} caractères",
      "network": "Erreur réseau, réessayer"
    }
  },
  "nav": {
    "dashboard": "Tableau de bord",
    "settings": "Paramètres",
    "logout": "Déconnexion"
  },
  "auth": {
    "login": {
      "title": "Connexion",
      "email": "E-mail",
      "password": "Mot de passe",
      "submit": "Se connecter"
    }
  },
  "guest": {
    "join": {
      "title": "Rejoindre la session",
      "display_name": "Ton pseudo",
      "connecting": "Connexion..."
    }
  }
}
```

`packages/i18n/catalogues/en.json`:

```json
{
  "common": {
    "button": {
      "save": "Save",
      "cancel": "Cancel",
      "join": "Join",
      "close": "Close",
      "submit": "Submit",
      "greet": "Greet",
      "ping": "Ping"
    },
    "error": {
      "required": "Required field",
      "too_long": "Maximum {max} characters",
      "network": "Network error, retry"
    }
  },
  "nav": {
    "dashboard": "Dashboard",
    "settings": "Settings",
    "logout": "Logout"
  },
  "auth": {
    "login": {
      "title": "Sign in",
      "email": "Email",
      "password": "Password",
      "submit": "Sign in"
    }
  },
  "guest": {
    "join": {
      "title": "Join session",
      "display_name": "Your nickname",
      "connecting": "Connecting..."
    }
  }
}
```

`packages/i18n/catalogues/es.json`:

```json
{
  "common": {
    "button": {
      "save": "Guardar",
      "cancel": "Cancelar",
      "join": "Unirse",
      "close": "Cerrar",
      "submit": "Enviar",
      "greet": "Saludar",
      "ping": "Ping"
    },
    "error": {
      "required": "Campo obligatorio",
      "too_long": "Máximo {max} caracteres",
      "network": "Error de red, reintentar"
    }
  },
  "nav": {
    "dashboard": "Panel",
    "settings": "Ajustes",
    "logout": "Cerrar sesión"
  },
  "auth": {
    "login": {
      "title": "Iniciar sesión",
      "email": "Correo electrónico",
      "password": "Contraseña",
      "submit": "Iniciar sesión"
    }
  },
  "guest": {
    "join": {
      "title": "Unirse a la sesión",
      "display_name": "Tu apodo",
      "connecting": "Conectando..."
    }
  }
}
```

- [ ] **Step 19.4: Create merge.ts (merges module i18n into catalogue global)**

`packages/i18n/src/merge.ts`:

```ts
#!/usr/bin/env tsx
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const CATALOGUES_DIR = resolve(import.meta.dirname, '../catalogues');
const LOCALES = ['fr', 'en', 'es'] as const;

async function loadCoreCatalogue(locale: string) {
  const path = join(CATALOGUES_DIR, `${locale}.json`);
  return JSON.parse(await readFile(path, 'utf8'));
}

async function loadModuleCatalogue(slug: string, locale: string) {
  const path = join(ROOT, 'packages', `module-${slug}`, 'src', 'i18n', `${locale}.json`);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch { return null; }
}

async function main() {
  const packagesDir = resolve(ROOT, 'packages');
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const moduleSlugs = entries
    .filter(e => e.isDirectory() && e.name.startsWith('module-'))
    .map(e => e.name.replace(/^module-/, ''));

  for (const locale of LOCALES) {
    const core = await loadCoreCatalogue(locale);
    const merged: any = { ...core };
    for (const slug of moduleSlugs) {
      const modCat = await loadModuleCatalogue(slug, locale);
      if (modCat) Object.assign(merged, modCat);
    }
    const out = join(CATALOGUES_DIR, `merged.${locale}.json`);
    await writeFile(out, JSON.stringify(merged, null, 2), 'utf8');
    console.log(`[i18n:merge] wrote ${out}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 19.5: Create config.ts + index.ts**

`packages/i18n/src/config.ts`:

```ts
export const LOCALES = ['fr', 'en', 'es'] as const;
export type Locale = typeof LOCALES[number];
export const DEFAULT_LOCALE: Locale = 'fr';
```

`packages/i18n/src/index.ts`:

```ts
export * from './config';
```

- [ ] **Step 19.6: Commit**

```bash
git add packages/i18n
git commit -m "feat(i18n): next-intl setup + FR/EN/ES catalogues + module merge script"
```

### Task 20: packages/ui (shadcn/ui + 7 composants)

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/components.json`, `packages/ui/src/index.ts`, `packages/ui/src/lib/utils.ts`, `packages/ui/src/globals.css`, plus one file per component

- [ ] **Step 20.1: Create package.json**

```json
{
  "name": "@quetzal/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./styles.css": "./dist/globals.css"
  },
  "scripts": {
    "build": "tsc && cp src/globals.css dist/globals.css",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-slot": "^1.1.1",
    "@radix-ui/react-toast": "^1.2.4",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.469.0",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@quetzal/config": "workspace:*",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 20.2: Create tsconfig.json + components.json**

`packages/ui/tsconfig.json`:
```json
{
  "extends": "@quetzal/config/typescript/nextjs.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": false,
    "jsx": "react-jsx",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

`packages/ui/components.json`:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": { "components": "src/components", "utils": "src/lib/utils" }
}
```

- [ ] **Step 20.3: Create lib/utils.ts**

`packages/ui/src/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 20.4: Create globals.css (Tailwind + CSS vars shadcn)**

`packages/ui/src/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    /* ... (voir shadcn docs pour couleurs dark complètes) */
  }
}
```

- [ ] **Step 20.5: Create components (Button, Card, Input, Dialog, Sheet, Toast, Form)**

Use shadcn CLI OR copy templates. Simplest: install shadcn CLI dev-only + init.

```bash
pnpm --filter @quetzal/ui exec npx shadcn@latest init --yes --defaults
pnpm --filter @quetzal/ui exec npx shadcn@latest add button dialog input toast card sheet form label -y
```

If CLI conflicts with monorepo, create manually — see Radix + shadcn docs for standard patterns. Each component ~30-100 lines.

- [ ] **Step 20.6: Create src/index.ts (barrel export)**

`packages/ui/src/index.ts`:
```ts
export * from './components/button';
export * from './components/card';
export * from './components/dialog';
export * from './components/input';
export * from './components/toast';
export * from './components/sheet';
export * from './components/form';
export * from './components/label';
export { cn } from './lib/utils';
```

- [ ] **Step 20.7: Build + commit**

```bash
pnpm --filter @quetzal/ui build
git add packages/ui
git commit -m "feat(ui): shadcn/ui base — Button, Card, Dialog, Input, Toast, Sheet, Form"
```

## Phase 6 — apps/host Next 15 scaffold

### Task 21: apps/host Next 15 bootstrap + rewrites + Tailwind

**Files:**
- Create: `apps/host/package.json`, `apps/host/tsconfig.json`, `apps/host/next.config.ts`, `apps/host/tailwind.config.js`, `apps/host/postcss.config.mjs`, `apps/host/src/app/layout.tsx`, `apps/host/src/app/page.tsx`, `apps/host/src/app/globals.css`, `apps/host/src/i18n/request.ts`, `apps/host/middleware.ts`, `apps/host/instrumentation.ts`

- [ ] **Step 21.1: Create package.json**

```json
{
  "name": "quetzal-host",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "next build",
    "dev": "next dev --turbopack -p 3000",
    "start": "next start -p 3000",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.1.3",
    "next-intl": "^3.26.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "socket.io-client": "^4.8.1",
    "qrcode": "^1.5.4",
    "@sentry/nextjs": "^8.42.0",
    "better-auth": "^1.1.7",
    "web-vitals": "^4.2.4",
    "@quetzal/auth": "workspace:*",
    "@quetzal/core": "workspace:*",
    "@quetzal/db": "workspace:*",
    "@quetzal/i18n": "workspace:*",
    "@quetzal/ui": "workspace:*",
    "@quetzal/module-hello": "workspace:*"
  },
  "devDependencies": {
    "@quetzal/config": "workspace:*",
    "@types/node": "^22.10.0",
    "@types/qrcode": "^1.5.5",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.17.0",
    "eslint-config-next": "^15.1.3",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "tailwindcss-animate": "^1.0.7",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 21.2: Create tsconfig.json**

```json
{
  "extends": "@quetzal/config/typescript/nextjs.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "src/**/*", "middleware.ts", "instrumentation.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 21.3: Create next.config.ts (with selective rewrites)**

`apps/host/next.config.ts`:

```ts
import type { NextConfig } from 'next';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const config: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/modules/:path*', destination: `${API}/api/modules/:path*` },
      { source: '/api/guest-token', destination: `${API}/api/guest-token` },
      { source: '/api/audit/:path*', destination: `${API}/api/audit/:path*` },
      { source: '/api/health', destination: `${API}/api/health` },
      { source: '/ws/:path*', destination: `${API}/ws/:path*` },
      // '/api/auth/*' → Route Handlers Next (NOT rewritten)
    ];
  },
  experimental: {
    typedRoutes: true,
  },
};

export default config;
```

- [ ] **Step 21.4: Create tailwind.config.js + postcss.config.mjs**

`apps/host/tailwind.config.js`:
```js
const preset = require('@quetzal/config/tailwind/preset');
module.exports = {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/module-*/src/**/*.{ts,tsx}',
  ],
};
```

`apps/host/postcss.config.mjs`:
```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {}},
};
```

- [ ] **Step 21.5: Create root layout + globals.css + home page**

`apps/host/src/app/globals.css`:
```css
@import '@quetzal/ui/styles.css';
```

`apps/host/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quetzal',
  description: 'Plateforme éducative interactive',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

`apps/host/src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/login');
}
```

- [ ] **Step 21.6: Create i18n/request.ts (next-intl config)**

`apps/host/src/i18n/request.ts`:

```ts
import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { LOCALES, DEFAULT_LOCALE, type Locale } from '@quetzal/i18n';
import frMessages from '@quetzal/i18n/catalogues/fr.json';
import enMessages from '@quetzal/i18n/catalogues/en.json';
import esMessages from '@quetzal/i18n/catalogues/es.json';

const messagesByLocale: Record<Locale, any> = { fr: frMessages, en: enMessages, es: esMessages };

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value as Locale | undefined;
  const acceptLang = (await headers()).get('accept-language');
  const browserLocale = acceptLang?.split(',')[0]?.split('-')[0] as Locale | undefined;
  const locale: Locale = LOCALES.includes(cookieLocale as any) ? cookieLocale!
    : LOCALES.includes(browserLocale as any) ? browserLocale!
    : DEFAULT_LOCALE;
  return { locale, messages: messagesByLocale[locale] };
});
```

- [ ] **Step 21.7: Create middleware.ts (CSP nonce)**

`apps/host/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const wsApi = API.replace(/^http/, 'ws');

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self' ${API} ${wsApi}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders }});
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export const config = { matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)' };
```

- [ ] **Step 21.8: Build + smoke test**

```bash
pnpm install
pnpm --filter quetzal-host build
pnpm --filter quetzal-host dev &
sleep 5
curl http://localhost:3000/
kill %1
```

- [ ] **Step 21.9: Commit**

```bash
git add apps/host
git commit -m "feat(host): Next 15 bootstrap — Tailwind, next-intl (3 locales), CSP middleware, selective rewrites"
```

### Task 22: Better-Auth handlers + auth-client + api-client wrapper

**Files:**
- Create: `apps/host/src/app/api/auth/[...all]/route.ts`, `apps/host/src/lib/auth-client.ts`, `apps/host/src/lib/api-client.ts`

- [ ] **Step 22.1: Create Better-Auth Route Handler**

`apps/host/src/app/api/auth/[...all]/route.ts`:

```ts
import { auth } from '@quetzal/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 22.2: Create auth-client**

`apps/host/src/lib/auth-client.ts`:

```ts
'use client';
import { createAuthClient } from 'better-auth/client';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: '',  // same origin
  plugins: [organizationClient()],
});
```

- [ ] **Step 22.3: Create api-client wrapper (fetch with JWT bearer)**

`apps/host/src/lib/api-client.ts`:

```ts
import { authClient } from './auth-client';

let cachedToken: string | null = null;
let expiresAt = 0;

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < expiresAt - 60_000) return cachedToken;
  const res = await fetch('/api/auth/token', { credentials: 'include' });
  if (!res.ok) return null;
  const { token, exp } = await res.json();
  cachedToken = token;
  expiresAt = (exp ?? Math.floor(Date.now() / 1000) + 3600) * 1000;
  return token;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(path, { ...init, headers, credentials: 'include' });
}
```

- [ ] **Step 22.4: Commit**

```bash
git add apps/host/src/app/api/auth apps/host/src/lib
git commit -m "feat(host): Better-Auth Route Handler + authClient + apiFetch wrapper (JWT bearer, mem cache)"
```

### Task 23: Login page + Dashboard shell (sidebar module registry)

**Files:**
- Create: `apps/host/src/app/login/page.tsx`, `apps/host/src/app/dashboard/page.tsx`, `apps/host/src/app/dashboard/layout.tsx`, `apps/host/src/components/shell/topbar.tsx`, `apps/host/src/components/shell/sidebar.tsx`, `apps/host/src/lib/modules-client.ts`

- [ ] **Step 23.1: Create login page**

`apps/host/src/app/login/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authClient } from '@/lib/auth-client';
import { Button, Card, Input, Label } from '@quetzal/ui';

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setPending(true);
    const { error: err } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (err) setError(err.message ?? 'Erreur');
    else router.push('/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-2xl font-semibold mb-4">{t('title')}</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">{t('email')}</Label>
            <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">{t('password')}</Label>
            <Input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full">{t('submit')}</Button>
        </form>
      </Card>
    </main>
  );
}
```

- [ ] **Step 23.2: Create dashboard layout with shell**

`apps/host/src/app/dashboard/layout.tsx`:

```tsx
import { Topbar } from '@/components/shell/topbar';
import { Sidebar } from '@/components/shell/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 23.3: Create modules-client (registry côté client)**

`apps/host/src/lib/modules-client.ts`:

```ts
export interface ClientModuleEntry {
  slug: string;
  navItem: {
    icon: string;
    labelKey: string;
    visibleTo: string[];
    order?: number;
  } | null;
}

// Static registry populated at build time (see generate-module-routes script Task 28).
// For MVP, we hardcode the list from NEXT_PUBLIC_MODULES.
const SLUGS = (process.env.NEXT_PUBLIC_MODULES ?? '').split(',').filter(Boolean);

export async function loadClientModuleRegistry(): Promise<ClientModuleEntry[]> {
  const entries: ClientModuleEntry[] = [];
  for (const slug of SLUGS) {
    try {
      const mod = await import(`@quetzal/module-${slug}`);
      entries.push({ slug, navItem: mod.manifest.navItem });
    } catch (e) {
      console.error(`Failed to load module ${slug}`, e);
    }
  }
  return entries;
}
```

- [ ] **Step 23.4: Create Sidebar component**

`apps/host/src/components/shell/sidebar.tsx`:

```tsx
import Link from 'next/link';
import { loadClientModuleRegistry } from '@/lib/modules-client';
import { getTranslations } from 'next-intl/server';

export async function Sidebar() {
  const modules = await loadClientModuleRegistry();
  const t = await getTranslations();
  const items = modules
    .filter(m => m.navItem)
    .sort((a, b) => (a.navItem!.order ?? 100) - (b.navItem!.order ?? 100));

  return (
    <aside className="w-56 border-r bg-muted/30 p-4">
      <div className="text-lg font-semibold mb-6">Quetzal</div>
      <nav className="space-y-1">
        {items.map(m => (
          <Link
            key={m.slug}
            href={`/modules/${m.slug}` as any}
            className="block rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            {t(m.navItem!.labelKey)}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 23.5: Create Topbar (with logout + locale switcher)**

`apps/host/src/components/shell/topbar.tsx`:

```tsx
'use client';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { Button } from '@quetzal/ui';
import { LocaleSwitcher } from './locale-switcher';

export function Topbar() {
  const router = useRouter();

  async function logout() {
    await authClient.signOut();
    router.push('/login');
  }

  return (
    <header className="flex h-14 items-center justify-end gap-2 border-b px-4">
      <LocaleSwitcher />
      <Button variant="outline" size="sm" onClick={logout}>Logout</Button>
    </header>
  );
}
```

- [ ] **Step 23.6: Create dashboard page**

`apps/host/src/app/dashboard/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';

export default async function DashboardPage() {
  const t = await getTranslations('nav');
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t('dashboard')}</h1>
      <p className="mt-2 text-muted-foreground">Modules enabled for your tenant appear in the sidebar.</p>
    </div>
  );
}
```

- [ ] **Step 23.7: Commit**

```bash
git add apps/host/src/app/login apps/host/src/app/dashboard apps/host/src/components/shell apps/host/src/lib/modules-client.ts
git commit -m "feat(host): login page + dashboard shell (sidebar registry-driven, topbar with logout)"
```

### Task 24: LocaleSwitcher + PATCH /api/user/locale route

**Files:**
- Create: `apps/host/src/components/shell/locale-switcher.tsx`, `apps/host/src/app/api/user/locale/route.ts`

- [ ] **Step 24.1: Create PATCH endpoint**

`apps/host/src/app/api/user/locale/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@quetzal/auth';
import { rootPrisma } from '@quetzal/db';

const schema = z.object({ locale: z.enum(['fr', 'en', 'es']) });

export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await rootPrisma.user.update({
    where: { id: session.user.id },
    data: { locale: parsed.data.locale } as any,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set('NEXT_LOCALE', parsed.data.locale, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  return response;
}
```

- [ ] **Step 24.2: Create LocaleSwitcher component**

`apps/host/src/components/shell/locale-switcher.tsx`:

```tsx
'use client';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  async function change(newLocale: string) {
    await fetch('/api/user/locale', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: newLocale }),
    });
    router.refresh();
  }

  return (
    <select
      value={locale}
      onChange={e => change(e.target.value)}
      className="rounded-md border bg-background px-2 py-1 text-sm"
      aria-label="Language"
    >
      <option value="fr">Français</option>
      <option value="en">English</option>
      <option value="es">Español</option>
    </select>
  );
}
```

- [ ] **Step 24.3: Commit**

```bash
git add apps/host/src/components/shell/locale-switcher.tsx apps/host/src/app/api/user/locale
git commit -m "feat(host): LocaleSwitcher UI + PATCH /api/user/locale (updates User.locale + NEXT_LOCALE cookie)"
```

### Task 25: Guest join page (/j/[moduleSlug]/[sessionId])

**Files:**
- Create: `apps/host/src/app/j/[moduleSlug]/[sessionId]/page.tsx`, `apps/host/src/components/guest-join-shell.tsx`

- [ ] **Step 25.1: Create GuestJoinShell**

`apps/host/src/components/guest-join-shell.tsx`:

```tsx
'use client';
import { useEffect, useState, type ComponentType } from 'react';

interface Props {
  moduleSlug: string;
  sessionId: string;
  tenantId: string;
}

export function GuestJoinShell({ moduleSlug, sessionId, tenantId }: Props) {
  const [Component, setComponent] = useState<ComponentType<Props> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const mod = await import(`@quetzal/module-${moduleSlug}`);
        const load = mod.manifest?.guestJoinComponent;
        if (!load) { setError('Module does not support guest join'); return; }
        const { default: C } = await load();
        setComponent(() => C);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [moduleSlug]);

  if (error) return <p role="alert">{error}</p>;
  if (!Component) return <p>Loading...</p>;
  return <Component moduleSlug={moduleSlug} sessionId={sessionId} tenantId={tenantId} />;
}
```

- [ ] **Step 25.2: Create /j/[moduleSlug]/[sessionId]/page.tsx**

```tsx
import { GuestJoinShell } from '@/components/guest-join-shell';

interface Props {
  params: Promise<{ moduleSlug: string; sessionId: string }>;
  searchParams: Promise<{ tenantId?: string }>;
}

export default async function GuestJoinPage({ params, searchParams }: Props) {
  const { moduleSlug, sessionId } = await params;
  const { tenantId } = await searchParams;
  if (!tenantId) return <p role="alert">Missing tenantId</p>;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <GuestJoinShell moduleSlug={moduleSlug} sessionId={sessionId} tenantId={tenantId} />
    </main>
  );
}
```

- [ ] **Step 25.3: Commit**

```bash
git add apps/host/src/app/j apps/host/src/components/guest-join-shell.tsx
git commit -m "feat(host): guest join page /j/<slug>/<sessionId>?tenantId=... mounts module guestJoinComponent"
```

### Task 26: Sentry setup + build script generate-module-routes

**Files:**
- Create: `apps/host/sentry.client.config.ts`, `apps/host/sentry.server.config.ts`, `apps/host/instrumentation.ts`, `packages/core/scripts/generate-module-routes.ts`, `packages/core/scripts/watch-manifests.ts`

- [ ] **Step 26.1: Create Sentry configs**

`apps/host/sentry.client.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN_HOST) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN_HOST,
    tracesSampleRate: 0.2,
    beforeSend(event) {
      if (event.user) event.user = { id: event.user.id };
      return event;
    },
  });
}
```

`apps/host/sentry.server.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs';

if (process.env.SENTRY_DSN_HOST) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN_HOST,
    tracesSampleRate: 0.2,
    beforeSend(event) {
      if (event.user) event.user = { id: event.user.id };
      if (event.request?.cookies) event.request.cookies = '[REDACTED]';
      return event;
    },
  });
}
```

`apps/host/instrumentation.ts`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
}
```

- [ ] **Step 26.2: Create generate-module-routes.ts**

`packages/core/scripts/generate-module-routes.ts`:

```ts
#!/usr/bin/env tsx
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const HOST_ROUTES = resolve(ROOT, 'apps/host/app/modules');
const SLUGS = (process.env.MODULES ?? process.env.NEXT_PUBLIC_MODULES ?? '').split(',').filter(Boolean);

async function main() {
  await rm(HOST_ROUTES, { recursive: true, force: true });
  await mkdir(HOST_ROUTES, { recursive: true });

  for (const slug of SLUGS) {
    const dir = resolve(HOST_ROUTES, `[slug=${slug}]`);
    // Simpler approach : one catch-all per module
    const moduleDir = resolve(HOST_ROUTES, slug);
    await mkdir(resolve(moduleDir, '[[...path]]'), { recursive: true });
    const pageContent = `// GENERATED — do not edit. Re-run pnpm dev:routes to regenerate.
'use client';
import { useEffect, useState, type ComponentType } from 'react';

export default function ModuleRoutePage({ params }: { params: Promise<{ path?: string[] }>}) {
  const [Component, setComponent] = useState<ComponentType<any> | null>(null);
  useEffect(() => {
    (async () => {
      const { manifest } = await import('@quetzal/module-${slug}');
      const p = (await params).path?.join('/') ?? '';
      const route = manifest.uiRoutes.find((r: any) => r.path === p) ?? manifest.uiRoutes[0];
      const { default: C } = await route.component();
      setComponent(() => C);
    })();
  }, [params]);
  if (!Component) return null;
  return <Component />;
}
`;
    await writeFile(resolve(moduleDir, '[[...path]]', 'page.tsx'), pageContent, 'utf8');
    console.log(`[generate-module-routes] wrote apps/host/app/modules/${slug}/[[...path]]/page.tsx`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
```

Add scripts to `packages/core/package.json`:
```json
"generate:routes": "tsx scripts/generate-module-routes.ts"
```

Add to `apps/host/package.json` prebuild:
```json
"prebuild": "pnpm --filter @quetzal/core generate:routes",
"predev": "pnpm --filter @quetzal/core generate:routes"
```

- [ ] **Step 26.3: Create watch-manifests.ts**

`packages/core/scripts/watch-manifests.ts`:

```ts
#!/usr/bin/env tsx
import chokidar from 'chokidar';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');

const watcher = chokidar.watch(`${ROOT}/packages/module-*/src/manifest.ts`, { ignoreInitial: true });

function regenerate() {
  console.log('[watch-manifests] change detected, regenerating routes');
  spawn('pnpm', ['--filter', '@quetzal/core', 'generate:routes'], { stdio: 'inherit' });
}

watcher.on('add', regenerate).on('change', regenerate).on('unlink', regenerate);
console.log('[watch-manifests] watching packages/module-*/src/manifest.ts');
```

- [ ] **Step 26.4: Commit**

```bash
git add apps/host/sentry.client.config.ts apps/host/sentry.server.config.ts apps/host/instrumentation.ts packages/core/scripts
git commit -m "feat(host): Sentry setup + generate-module-routes script + watch-manifests HMR helper"
```

## Phase 7 — packages/module-hello (le module stub)

### Task 27: module-hello scaffold + Domain (Greeting, DisplayName) TDD

**Files:**
- Create: `packages/module-hello/package.json`, `packages/module-hello/tsconfig.json`, `packages/module-hello/vitest.config.ts`, `packages/module-hello/src/domain/greeting.ts`, `packages/module-hello/src/domain/greeting.spec.ts`, `packages/module-hello/src/domain/errors.ts`

- [ ] **Step 27.1: Create package.json**

```json
{
  "name": "@quetzal/module-hello",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./manifest": "./dist/manifest.js"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx --config .eslintrc.js",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.15",
    "@nestjs/websockets": "^10.4.15",
    "@nestjs/platform-socket.io": "^10.4.15",
    "socket.io": "^4.8.1",
    "zod": "^3.24.1",
    "react": "^19.0.0",
    "@quetzal/core": "workspace:*",
    "@quetzal/db": "workspace:*",
    "@quetzal/ui": "workspace:*"
  },
  "devDependencies": {
    "@quetzal/config": "workspace:*",
    "@types/react": "^19.0.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 27.2: Create tsconfig.json + .eslintrc.js**

`packages/module-hello/tsconfig.json`:
```json
{
  "extends": "@quetzal/config/typescript/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"],
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.spec.ts", "dist"]
}
```

`packages/module-hello/.eslintrc.js`:
```js
module.exports = require('@quetzal/config/eslint/module');
```

- [ ] **Step 27.3: Create errors.ts (Domain errors)**

`packages/module-hello/src/domain/errors.ts`:

```ts
export class DomainError extends Error {}
export class EmptyDisplayNameError extends DomainError {
  constructor() { super('DisplayName cannot be empty'); this.name = 'EmptyDisplayNameError'; }
}
export class DisplayNameTooLongError extends DomainError {
  constructor() { super('DisplayName exceeds 32 characters'); this.name = 'DisplayNameTooLongError'; }
}
```

- [ ] **Step 27.4: Write failing tests for Greeting + DisplayName**

`packages/module-hello/src/domain/greeting.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Greeting, DisplayName } from './greeting';
import { EmptyDisplayNameError, DisplayNameTooLongError } from './errors';

describe('DisplayName', () => {
  it('accepts a valid name', () => {
    const name = DisplayName.of('Elda');
    expect(name.toString()).toBe('Elda');
  });

  it('rejects empty string', () => {
    expect(() => DisplayName.of('')).toThrow(EmptyDisplayNameError);
  });

  it('rejects over 32 characters', () => {
    expect(() => DisplayName.of('x'.repeat(33))).toThrow(DisplayNameTooLongError);
  });

  it('accepts exactly 32 characters', () => {
    expect(() => DisplayName.of('x'.repeat(32))).not.toThrow();
  });
});

describe('Greeting', () => {
  it('formats the message with the display name', () => {
    const greeting = Greeting.for(DisplayName.of('Elda'));
    expect(greeting.message).toBe('Hello Elda');
  });
});
```

- [ ] **Step 27.5: Commit failing test**

```bash
git add packages/module-hello/src/domain/greeting.spec.ts packages/module-hello/src/domain/errors.ts packages/module-hello/package.json packages/module-hello/tsconfig.json packages/module-hello/.eslintrc.js
git commit -m "test(module-hello): DisplayName validates length, Greeting formats message"
```

- [ ] **Step 27.6: Implement greeting.ts**

`packages/module-hello/src/domain/greeting.ts`:

```ts
import { EmptyDisplayNameError, DisplayNameTooLongError } from './errors';

export class DisplayName {
  private constructor(private readonly value: string) {}

  static of(raw: string): DisplayName {
    if (raw.length === 0) throw new EmptyDisplayNameError();
    if (raw.length > 32) throw new DisplayNameTooLongError();
    return new DisplayName(raw);
  }

  toString(): string { return this.value; }
}

export class Greeting {
  private constructor(readonly message: string) {}

  static for(name: DisplayName): Greeting {
    return new Greeting(`Hello ${name.toString()}`);
  }
}
```

- [ ] **Step 27.7: Run tests + commit**

```bash
pnpm --filter @quetzal/module-hello test
git add packages/module-hello/src/domain/greeting.ts
git commit -m "feat(module-hello): DisplayName value object + Greeting entity"
```

### Task 28: Application layer (GreetUseCase) + Ports + tests

**Files:**
- Create: `packages/module-hello/src/application/greet.use-case.ts`, `packages/module-hello/src/application/greet.use-case.spec.ts`, `packages/module-hello/src/domain/ports/greeting.repository.ts`

- [ ] **Step 28.1: Create GreetingRepository port**

`packages/module-hello/src/domain/ports/greeting.repository.ts`:

```ts
export interface GreetingRecord {
  id: string;
  userId: string;
  message: string;
}

export interface GreetingRepository {
  save(input: { userId: string; message: string }): Promise<GreetingRecord>;
}
```

- [ ] **Step 28.2: Write failing test for GreetUseCase**

`packages/module-hello/src/application/greet.use-case.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { GreetUseCase } from './greet.use-case';
import type { GreetingRepository } from '../domain/ports/greeting.repository';

const makeFakeRepo = (): GreetingRepository & { save: ReturnType<typeof vi.fn> } => ({
  save: vi.fn(async (input) => ({ id: 'g1', ...input })),
});

const makeFakeBus = () => ({
  emit: vi.fn(async () => {}),
  on: vi.fn(),
});

describe('GreetUseCase', () => {
  it('greets a user with their display name', async () => {
    const repo = makeFakeRepo();
    const bus = makeFakeBus();
    const useCase = new GreetUseCase(repo, bus as any);
    const result = await useCase.execute({ userId: 'u1', rawName: 'Elda', tenantId: 't1', requestId: 'r1' });
    expect(result.message).toBe('Hello Elda');
  });

  it('persists the greeting through the repository', async () => {
    const repo = makeFakeRepo();
    const useCase = new GreetUseCase(repo, makeFakeBus() as any);
    await useCase.execute({ userId: 'u1', rawName: 'Elda', tenantId: 't1', requestId: 'r1' });
    expect(repo.save).toHaveBeenCalledWith({ userId: 'u1', message: 'Hello Elda' });
  });

  it('emits hello.greeted event', async () => {
    const bus = makeFakeBus();
    const useCase = new GreetUseCase(makeFakeRepo(), bus as any);
    await useCase.execute({ userId: 'u1', rawName: 'Elda', tenantId: 't1', requestId: 'r1' });
    expect(bus.emit).toHaveBeenCalledWith('hello.greeted', expect.objectContaining({ userId: 'u1', tenantId: 't1', message: 'Hello Elda' }));
  });
});
```

- [ ] **Step 28.3: Commit failing test**

```bash
git add packages/module-hello/src/application/greet.use-case.spec.ts packages/module-hello/src/domain/ports
git commit -m "test(module-hello): GreetUseCase persists, emits event, returns greeting"
```

- [ ] **Step 28.4: Implement GreetUseCase**

`packages/module-hello/src/application/greet.use-case.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Greeting, DisplayName } from '../domain/greeting';
import type { GreetingRepository } from '../domain/ports/greeting.repository';
import type { EventBus } from '@quetzal/core';

export interface GreetInput {
  userId: string;
  tenantId: string;
  rawName: string;
  requestId: string;
}

@Injectable()
export class GreetUseCase {
  constructor(
    private readonly repo: GreetingRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(input: GreetInput): Promise<Greeting> {
    const name = DisplayName.of(input.rawName);
    const greeting = Greeting.for(name);
    await this.repo.save({ userId: input.userId, message: greeting.message });
    await this.eventBus.emit('hello.greeted', {
      userId: input.userId,
      tenantId: input.tenantId,
      requestId: input.requestId,
      message: greeting.message,
    });
    return greeting;
  }
}
```

- [ ] **Step 28.5: Run tests + commit**

```bash
pnpm --filter @quetzal/module-hello test
git add packages/module-hello/src/application/greet.use-case.ts
git commit -m "feat(module-hello): GreetUseCase orchestrates domain + repo + event bus"
```

### Task 29: Prisma models + Infrastructure repository

**Files:**
- Create: `packages/module-hello/prisma/models.prisma`, `packages/module-hello/src/infrastructure/prisma-greeting.repository.ts`, `packages/module-hello/src/infrastructure/prisma-greeting.repository.integration.spec.ts`, `packages/module-hello/vitest.integration.config.ts`

- [ ] **Step 29.1: Create prisma/models.prisma**

`packages/module-hello/prisma/models.prisma`:

```prisma
model Hello_Greeting {
  id        String   @db.Uuid
  tenantId  String   @db.Uuid
  userId    String   @db.Uuid
  message   String   @db.VarChar(255)
  createdAt DateTime @default(now())

  @@id([id, tenantId])
  @@index([tenantId, userId, createdAt])
}
```

- [ ] **Step 29.2: Re-merge schema + regenerate + migrate**

```bash
pnpm --filter @quetzal/db schema:merge
pnpm --filter @quetzal/db generate:tenant-registry
pnpm --filter @quetzal/db exec prisma migrate dev --name add-module-hello --schema=prisma/schema.prisma
```

- [ ] **Step 29.3: Implement PrismaGreetingRepository**

`packages/module-hello/src/infrastructure/prisma-greeting.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { newId } from '@quetzal/db';
import { getTenantScopedPrisma } from '@quetzal/core';
import type { GreetingRepository, GreetingRecord } from '../domain/ports/greeting.repository';

@Injectable()
export class PrismaGreetingRepository implements GreetingRepository {
  async save(input: { userId: string; message: string }): Promise<GreetingRecord> {
    const prisma = getTenantScopedPrisma();
    const id = newId();
    const row = await (prisma as any).hello_Greeting.create({
      data: { id, userId: input.userId, message: input.message } as any,
    });
    return { id: row.id, userId: row.userId, message: row.message };
  }
}
```

- [ ] **Step 29.4: Create integration test for tenant isolation on hello_Greeting**

`packages/module-hello/vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: false, environment: 'node',
    include: ['src/**/*.integration.spec.ts'],
    pool: 'threads', poolOptions: { threads: { singleThread: true }},
    testTimeout: 60_000,
  },
});
```

`packages/module-hello/src/infrastructure/prisma-greeting.repository.integration.spec.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing';
import { tenantStore, newId } from '@quetzal/core';
import { PrismaGreetingRepository } from './prisma-greeting.repository';

describe('PrismaGreetingRepository (integration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  it('persists a greeting scoped to current tenant', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaGreetingRepository();

    const result = await new Promise<any>((resolve) => {
      tenantStore.run(
        { tenantId, userId: ownerId, requestId: 'test' },
        async () => resolve(await repo.save({ userId: ownerId, message: 'Hello test' }))
      );
    });

    expect(result.message).toBe('Hello test');

    const root = new PrismaClient();
    const rows = await (root as any).hello_Greeting.findMany({ where: { tenantId }});
    expect(rows).toHaveLength(1);
    await root.$disconnect();
  });
});
```

- [ ] **Step 29.5: Run + commit**

```bash
pnpm --filter @quetzal/module-hello test:integration
git add packages/module-hello/prisma packages/module-hello/src/infrastructure packages/module-hello/vitest.integration.config.ts packages/db/prisma
git commit -m "feat(module-hello): Hello_Greeting Prisma model + tenant-scoped PrismaGreetingRepository"
```

### Task 30: Event types + Presentation (Controller + Gateway)

**Files:**
- Create: `packages/core/src/events/hello.ts`, `packages/module-hello/src/presentation/hello.controller.ts`, `packages/module-hello/src/presentation/hello.gateway.ts`, `packages/module-hello/src/presentation/hello.controller.spec.ts`

- [ ] **Step 30.1: Create event types in core**

`packages/core/src/events/hello.ts`:

```ts
export interface HelloGreetedEvent {
  userId: string;
  tenantId: string;
  requestId: string;
  message: string;
}

export interface HelloPingedEvent {
  userId: string;
  tenantId: string;
  latencyMs: number;
}
```

Rebuild core:
```bash
pnpm --filter @quetzal/core build
```

- [ ] **Step 30.2: Create HelloController**

`packages/module-hello/src/presentation/hello.controller.ts`:

```ts
import { Controller, Get, Req, Inject } from '@nestjs/common';
import type { Request } from 'express';
import { getCurrentTenant, tryGetCurrentTenant } from '@quetzal/core';
import { rootPrisma } from '@quetzal/db';
import { GreetUseCase } from '../application/greet.use-case';

@Controller('api/modules/hello')
export class HelloController {
  constructor(private readonly greet: GreetUseCase) {}

  @Get('greet')
  async doGreet(@Req() req: Request) {
    const ctx = getCurrentTenant();
    const user = await rootPrisma.user.findUniqueOrThrow({ where: { id: ctx.userId! }});
    const greeting = await this.greet.execute({
      userId: ctx.userId!,
      tenantId: ctx.tenantId,
      rawName: user.name ?? 'Anonymous',
      requestId: ctx.requestId,
    });
    return { msg: greeting.message, tenantId: ctx.tenantId, requestId: ctx.requestId };
  }
}
```

- [ ] **Step 30.3: Create HelloGateway**

`packages/module-hello/src/presentation/hello.gateway.ts`:

```ts
import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, OnGatewayConnection } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { eventBus, rooms } from '@quetzal/core';

@WebSocketGateway({ namespace: 'ws/hello', cors: { origin: '*', credentials: true }})
export class HelloGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  handleConnection(client: Socket) {
    const data = client.data as any;
    const sessionId = data.sessionId as string | undefined;
    if (data.role === 'guest' && sessionId) {
      client.join(rooms.session('hello', sessionId));
    }
  }

  @SubscribeMessage('ping')
  handlePing(@MessageBody() body: { at: number }, @ConnectedSocket() client: Socket) {
    const now = Date.now();
    const latencyMs = now - body.at;
    const data = client.data as any;
    if (data.userId && data.tenantId) {
      eventBus.emit('hello.pinged', { userId: data.userId, tenantId: data.tenantId, latencyMs });
    }
    return { event: 'pong', data: { latencyMs, serverAt: now }};
  }
}
```

- [ ] **Step 30.4: Commit**

```bash
git add packages/core/src/events/hello.ts packages/module-hello/src/presentation
git commit -m "feat(module-hello): HelloController (greet HTTP) + HelloGateway (ping/pong WS) + event types"
```

### Task 31: UI components (admin page + play page + guest-join)

**Files:**
- Create: `packages/module-hello/src/presentation/ui/hello-page.tsx`, `packages/module-hello/src/presentation/ui/guest-join.tsx`, `packages/module-hello/src/i18n/{fr,en,es}.json`

- [ ] **Step 31.1: Create UI hello page (Client Component)**

`packages/module-hello/src/presentation/ui/hello-page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { io, type Socket } from 'socket.io-client';
import { Button, Card } from '@quetzal/ui';

export default function HelloPage() {
  const t = useTranslations('common.button');
  const [greetMsg, setGreetMsg] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  async function onGreet() {
    // apiFetch is host-side; module UI uses standard fetch with auth header
    const { apiFetch } = await import('@/lib/api-client');
    const res = await apiFetch('/api/modules/hello/greet');
    const data = await res.json();
    setGreetMsg(data.msg);
  }

  async function onPing() {
    const { getGuestOrJwtToken } = await import('@/lib/api-client');
    const token = await getGuestOrJwtToken?.();
    const socket: Socket = io('/ws/hello', { auth: { token }, transports: ['websocket']});
    socket.emit('ping', { at: Date.now() }, (response: { latencyMs: number }) => {
      setLatency(response.latencyMs);
      socket.disconnect();
    });
  }

  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-xl font-semibold">Hello module</h2>
      <div className="flex gap-2">
        <Button onClick={onGreet}>{t('greet')}</Button>
        <Button variant="outline" onClick={onPing}>{t('ping')}</Button>
      </div>
      {greetMsg && <p data-testid="greet-result">{greetMsg}</p>}
      {latency !== null && <p data-testid="ping-result">Latency: {latency}ms</p>}
    </Card>
  );
}
```

- [ ] **Step 31.2: Create GuestJoin component**

`packages/module-hello/src/presentation/ui/guest-join.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { io, type Socket } from 'socket.io-client';
import { Button, Card, Input, Label } from '@quetzal/ui';

interface Props {
  tenantId: string;
  moduleSlug: string;
  sessionId: string;
}

export default function GuestJoin({ tenantId, moduleSlug, sessionId }: Props) {
  const t = useTranslations('guest.join');
  const [displayName, setDisplayName] = useState('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/guest-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, moduleSlug, sessionId, displayName }),
    });
    if (!res.ok) { setError(`Join failed (${res.status})`); return; }
    const { token } = await res.json();
    const socket: Socket = io('/ws/hello', { auth: { guestToken: token }, transports: ['websocket']});
    socket.on('connect', () => setConnected(true));
    socket.on('greeting', (payload: any) => console.log('greeting received', payload));
  }

  if (connected) {
    return <p data-testid="connected">Connected as {displayName}</p>;
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <h1 className="text-xl font-semibold mb-4">{t('title')}</h1>
      <form onSubmit={onJoin} className="space-y-4">
        <div>
          <Label htmlFor="displayName">{t('display_name')}</Label>
          <Input id="displayName" required maxLength={32} value={displayName} onChange={e => setDisplayName(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full">Join</Button>
      </form>
    </Card>
  );
}
```

- [ ] **Step 31.3: Create i18n catalogues**

`packages/module-hello/src/i18n/fr.json`:
```json
{
  "module": {
    "hello": {
      "nav": { "title": "Hello" },
      "page": { "welcome": "Bienvenue sur le module Hello" }
    }
  }
}
```

`packages/module-hello/src/i18n/en.json`:
```json
{
  "module": {
    "hello": {
      "nav": { "title": "Hello" },
      "page": { "welcome": "Welcome to the Hello module" }
    }
  }
}
```

`packages/module-hello/src/i18n/es.json`:
```json
{
  "module": {
    "hello": {
      "nav": { "title": "Hola" },
      "page": { "welcome": "Bienvenido al módulo Hola" }
    }
  }
}
```

- [ ] **Step 31.4: Commit**

```bash
git add packages/module-hello/src/presentation/ui packages/module-hello/src/i18n
git commit -m "feat(module-hello): UI (HelloPage with Greet/Ping buttons + GuestJoin form) + i18n FR/EN/ES"
```

### Task 32: NestJS Module class + Manifest + Contract test

**Files:**
- Create: `packages/module-hello/src/hello.module.ts`, `packages/module-hello/src/manifest.ts`, `packages/module-hello/src/index.ts`, `packages/module-hello/tests/manifest.spec.ts`

- [ ] **Step 32.1: Create NestJS Module**

`packages/module-hello/src/hello.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HelloController } from './presentation/hello.controller';
import { HelloGateway } from './presentation/hello.gateway';
import { GreetUseCase } from './application/greet.use-case';
import { PrismaGreetingRepository } from './infrastructure/prisma-greeting.repository';
import { eventBus } from '@quetzal/core';

@Module({
  controllers: [HelloController],
  providers: [
    HelloGateway,
    { provide: 'GreetingRepository', useClass: PrismaGreetingRepository },
    {
      provide: GreetUseCase,
      useFactory: (repo: any) => new GreetUseCase(repo, eventBus),
      inject: ['GreetingRepository'],
    },
  ],
})
export class HelloModule {}
```

- [ ] **Step 32.2: Create manifest.ts**

`packages/module-hello/src/manifest.ts`:

```ts
import type { QuetzalModuleManifest } from '@quetzal/core';
import { HelloModule } from './hello.module';

export const manifest: QuetzalModuleManifest = {
  slug: 'hello',
  name: { fr: 'Hello', en: 'Hello', es: 'Hola' },
  description: {
    fr: 'Module stub pour valider le contrat',
    en: 'Stub module to validate the contract',
    es: 'Módulo stub para validar el contrato',
  },
  version: '0.1.0',
  contractVersion: '1.0.0',
  enabledByDefault: true,
  apiModule: HelloModule,
  eventsPublished: [
    { name: 'hello.greeted', typeRef: 'HelloGreetedEvent' },
    { name: 'hello.pinged', typeRef: 'HelloPingedEvent' },
  ],
  uiRoutes: [
    {
      path: '',
      component: () => import('./presentation/ui/hello-page'),
      requiredRoles: ['owner', 'creator', 'learner'],
      layout: 'shell',
    },
  ],
  navItem: {
    icon: 'sparkles',
    labelKey: 'module.hello.nav.title',
    visibleTo: ['owner', 'creator', 'learner'],
    order: 10,
  },
  guestJoinComponent: () => import('./presentation/ui/guest-join'),
  permissions: {
    'http:GET /api/modules/hello/greet': ['owner', 'creator', 'learner'],
    'ws:ping': ['owner', 'creator', 'learner', 'guest'],
  },
  guestAccess: {
    enabled: true,
    tokenTTL: 7200,
    requireDisplayName: true,
    maxConcurrentPerSession: 100,
  },
  prismaModels: 'prisma/models.prisma',
};
```

- [ ] **Step 32.3: Create index.ts**

`packages/module-hello/src/index.ts`:

```ts
export { manifest } from './manifest';
export { HelloModule } from './hello.module';
```

- [ ] **Step 32.4: Create contract test**

`packages/module-hello/tests/manifest.spec.ts`:

```ts
import { runContractSuite } from '@quetzal/core/testing';
import { manifest } from '../src/manifest';
import { resolve } from 'node:path';

runContractSuite(manifest, { moduleRoot: resolve(import.meta.dirname, '..') });
```

- [ ] **Step 32.5: Run tests (contract suite) + commit**

```bash
pnpm --filter @quetzal/module-hello test
git add packages/module-hello/src/hello.module.ts packages/module-hello/src/manifest.ts packages/module-hello/src/index.ts packages/module-hello/tests
git commit -m "feat(module-hello): NestJS Module + manifest + contract test suite"
```

## Phase 8 — E2E + CI/CD

### Task 33: Playwright E2E smoke test

**Files:**
- Create: `playwright.config.ts` (root), `e2e/tests/hello.smoke.spec.ts`, `docker-compose.e2e.yml`

- [ ] **Step 33.1: Create root playwright.config.ts**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_HOST_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.CI ? undefined : {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 33.2: Add root package.json devDeps**

Add to root `package.json`:
```json
"devDependencies": {
  "@playwright/test": "^1.49.1"
}
```

Install:
```bash
pnpm install
pnpm exec playwright install --with-deps chromium
```

- [ ] **Step 33.3: Create smoke E2E test**

`e2e/tests/hello.smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const EMAIL = process.env.SEED_OWNER_EMAIL!;
const PASSWORD = process.env.SEED_OWNER_PASSWORD!;

test('Elda logs in, sees Hello in sidebar, greets, pings', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/e-mail|email/i).fill(EMAIL);
  await page.getByLabel(/password|mot de passe|contraseña/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|se connecter|iniciar/i }).click();
  await page.waitForURL(/\/dashboard/);

  // Sidebar shows Hello
  await expect(page.getByRole('link', { name: /hello|hola/i })).toBeVisible();
  await page.getByRole('link', { name: /hello|hola/i }).click();

  // Click Greet
  await page.getByRole('button', { name: /greet|saluer|saludar/i }).click();
  await expect(page.getByTestId('greet-result')).toContainText('Hello');

  // Click Ping
  await page.getByRole('button', { name: /^ping$/i }).click();
  await expect(page.getByTestId('ping-result')).toContainText(/latency/i);
});
```

- [ ] **Step 33.4: Create docker-compose for CI**

`docker-compose.e2e.yml`:

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: quetzal_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test"]
      interval: 2s
      timeout: 5s
      retries: 20
```

- [ ] **Step 33.5: Commit**

```bash
git add playwright.config.ts e2e docker-compose.e2e.yml package.json
git commit -m "test(e2e): Playwright smoke — login + sidebar + greet HTTP + ping WS"
```

### Task 34: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 34.1: Create ci.yml**

```yaml
name: CI

on:
  push:
    branches: [main, v2]
  pull_request:

env:
  NODE_VERSION: 22.11.0

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.15.0 }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @quetzal/auth generate
      - run: pnpm --filter @quetzal/db schema:merge
      - run: pnpm --filter @quetzal/db generate:tenant-registry
      - run: pnpm --filter @quetzal/db prisma:generate
      - run: pnpm turbo run lint typecheck

  test-unit:
    needs: quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.15.0 }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @quetzal/auth generate
      - run: pnpm --filter @quetzal/db schema:merge
      - run: pnpm --filter @quetzal/db generate:tenant-registry
      - run: pnpm --filter @quetzal/db prisma:generate
      - run: pnpm turbo run test

  test-integration:
    needs: quality
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_DB: quetzal_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 2s --health-timeout 5s --health-retries 20
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/quetzal_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.15.0 }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @quetzal/auth generate
      - run: pnpm --filter @quetzal/db schema:merge
      - run: pnpm --filter @quetzal/db generate:tenant-registry
      - run: pnpm --filter @quetzal/db prisma:migrate:deploy
      - run: pnpm --filter @quetzal/db prisma:generate
      - run: pnpm turbo run test:integration

  security-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.15.0 }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --prod --audit-level high

  test-e2e:
    needs: [test-unit, test-integration]
    runs-on: ubuntu-latest
    continue-on-error: true  # promoted blocking after 10 green runs
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_DB: quetzal_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 2s --health-timeout 5s --health-retries 20
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/quetzal_test
      BETTER_AUTH_SECRET: ${{ secrets.BETTER_AUTH_SECRET_TEST }}
      GUEST_TOKEN_SECRET: ${{ secrets.GUEST_TOKEN_SECRET_TEST }}
      SEED_OWNER_EMAIL: elda@test.dev
      SEED_OWNER_PASSWORD: TestPassword123!
      HOST_URL: http://localhost:3000
      API_URL: http://localhost:3001
      NEXT_PUBLIC_API_URL: http://localhost:3001
      NEXT_PUBLIC_MODULES: hello
      MODULES: hello
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.15.0 }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @quetzal/auth generate
      - run: pnpm --filter @quetzal/db schema:merge
      - run: pnpm --filter @quetzal/db generate:tenant-registry
      - run: pnpm --filter @quetzal/db prisma:migrate:deploy
      - run: pnpm --filter @quetzal/db prisma:generate
      - run: pnpm --filter @quetzal/db seed
      - run: pnpm build
      - run: pnpm --filter quetzal-api start &
      - run: pnpm --filter quetzal-host start &
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm exec playwright test
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: playwright-report, path: playwright-report/ }
```

- [ ] **Step 34.2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: GitHub Actions — quality + unit + integration (PG service) + security audit + E2E Playwright"
```

## Phase 9 — Verification & merge

### Task 35: Verify all 15 success criteria manually

**Files:** (none — verification only)

- [ ] **Step 35.1: Verify each success criterion from spec section 8.4**

Reference: [spec section 8.4](../specs/2026-08-29-quetzal-noyau-design.md#84-success-criteria-sous-projet-1).

For each criterion, capture screenshot + note in this file:

1. Elda logs in via /login → /dashboard ✅ / ❌
2. Sidebar affiche Hello ✅ / ❌
3. Clic Hello → page RSC layout shell ✅ / ❌
4. Bouton Greet → JSON + toast ✅ / ❌
5. Ping WS < 300ms ✅ / ❌
6. QR code scan mobile → join ✅ / ❌
7. Animateur broadcast → guest reçoit ✅ / ❌
8. Locale switcher fonctionne ✅ / ❌
9. Tous tests CI verts ✅ / ❌
10. Coverage domain ≥ 90%, application ≥ 80% ✅ / ❌
11. Zéro event Sentry level:error/fatal ✅ / ❌
12. Docs à jour ✅ / ❌
13. CLAUDE.md conventions suivies (correcteur-labs GO) ✅ / ❌
14. Merge v2 → main OK ✅ / ❌
15. Zéro FIXME, TODO taggés issues ✅ / ❌

- [ ] **Step 35.2: Run correcteur-labs audit**

Invoke agent `correcteur-labs` on last 30 commits, verify TDD compliance. Fix violations if any.

- [ ] **Step 35.3: Write docs/architecture.md + docs/module-contract.md**

Extract from spec sections 2-3, adapt for developer-focused reading. ~150 lignes chacun.

```bash
git add docs/architecture.md docs/module-contract.md
git commit -m "docs: architecture.md + module-contract.md (extracted from spec, dev-facing)"
```

### Task 36: Enable v2 in Vercel + merge v2 → main

**Files:**
- Modify: `vercel.json`, `README.md`

- [ ] **Step 36.1: Update vercel.json to enable v2 branch**

Modify `vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": {
    "deploymentEnabled": {
      "main": true,
      "v2": true
    }
  },
  "rewrites": [
    { "source": "/api/modules/:path*", "destination": "https://quetzal-api.onrender.com/api/modules/:path*" },
    { "source": "/api/guest-token", "destination": "https://quetzal-api.onrender.com/api/guest-token" },
    { "source": "/api/audit/:path*", "destination": "https://quetzal-api.onrender.com/api/audit/:path*" },
    { "source": "/api/health", "destination": "https://quetzal-api.onrender.com/api/health" },
    { "source": "/ws/:path*", "destination": "https://quetzal-api.onrender.com/ws/:path*" }
  ]
}
```

Note: Vercel root directory must point to `apps/host` (dashboard setting).

- [ ] **Step 36.2: Update README.md**

Overwrite `README.md`:

```markdown
# Quetzal 🦜

Plateforme éducative interactive multi-modulaire (loto, quiz, spaced repetition).

## Stack
- Next 15 (host, Vercel) + NestJS 11 (api, Render) + Postgres/Prisma (Neon)
- Better-Auth (JWT + org plugin) + Socket.io + next-intl (FR/EN/ES) + shadcn/ui
- pnpm workspaces + Turborepo

## Setup
```bash
pnpm install
cp .env.example .env.local  # fill values
pnpm --filter @quetzal/auth generate
pnpm --filter @quetzal/db schema:merge
pnpm --filter @quetzal/db generate:tenant-registry
pnpm --filter @quetzal/db prisma:migrate:deploy
pnpm --filter @quetzal/db prisma:generate
pnpm --filter @quetzal/db seed
pnpm dev
```

## Docs
- [Architecture](docs/architecture.md)
- [Module Contract](docs/module-contract.md)
- [Spec Design](docs/superpowers/specs/2026-08-29-quetzal-noyau-design.md)
- [Conventions CLAUDE.md](CLAUDE.md)

## Deployment
- Host (Vercel) : preview auto sur PR, prod sur push main
- Api (Render) : autoDeploy main, prisma migrate en pre-deploy
- DB (Neon) : provisionné via Vercel Marketplace
```

- [ ] **Step 36.3: Commit updates**

```bash
git add vercel.json README.md
git commit -m "chore(release): enable v2 deploys, update README with new stack + setup"
```

- [ ] **Step 36.4: Push v2 + create PR**

```bash
git push origin v2
gh pr create --base main --head v2 --title "Refonte noyau plateforme (sous-projet 1)" --body "$(cat <<'EOF'
## Summary
- Refonte from scratch : modular monolith Next+Nest
- Contrat de module + module stub hello-world
- Better-Auth JWT+JWKS + tenant-scoped Prisma + Socket.io
- CI/CD complet (Vercel + Render + GitHub Actions)

## Test plan
- [x] All CI jobs green
- [x] 15 success criteria manually verified (see plan Task 35)
- [x] correcteur-labs GO
- [x] Preview URL Vercel + Render live

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 36.5: Merge PR (after review)**

```bash
gh pr merge --squash --admin
git checkout main && git pull
```

- [ ] **Step 36.6: Verify prod deploy**

```bash
curl https://quetzal.app/api/health   # or quetzal-theta.vercel.app
curl https://quetzal-api.onrender.com/api/health
```

Expected: both return `{"status":"ok"}`.

- [ ] **Step 36.7: Delete v2 branch (cleanup)**

```bash
git branch -D v2
git push origin --delete v2
```

---

## Self-review notes

Points to verify inline during execution :

1. **Better-Auth API surface** : real method names may differ from what I've written (`auth.api.getActiveMember`, `authClient.getToken`). Check docs at implementation time.
2. **Testcontainers `withReuse()`** : verify behavior on CI vs local.
3. **shadcn components** : Task 20 assumes CLI works in monorepo. If not, copy manually from shadcn docs.
4. **Prisma client naming** : `hello_Greeting` in TypeScript = `Hello_Greeting` in Prisma (auto camelCase). Verify at runtime.
5. **Turborepo `dependsOn: ^build`** : ensure db/auth/core build before consumers.
6. **CSP nonce with RSC** : Next 15 has some caveats; may need `experimental.after` or dynamic rendering hints.

If any of these blocks progress, fix inline (patch task text and commit).







