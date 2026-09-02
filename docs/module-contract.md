# Module Contract

Every Quetzal module is a workspace package `packages/module-<slug>/` that exports a `manifest` satisfying `QuetzalModuleManifest` (from `@quetzal/core`). The registry at boot loads it, validates it against `manifestSchema` (Zod), and composes it into the running app.

## Two entries: server manifest and client manifest

A module package exposes two entry points (`package.json` `exports`):

| Entry | Export | Consumed by | May import |
|---|---|---|---|
| `.` / `./manifest` | `manifest: QuetzalModuleManifest` | `apps/api` (NestJS registry) | anything (NestJS, Prisma, domain) |
| `./client` | `clientManifest: ClientModuleManifest` | `apps/host` (Next.js bundle) | React, `@quetzal/ui`, next-intl, socket.io-client only |

`ClientModuleManifest` = `Pick<QuetzalModuleManifest, 'slug' | 'name' | 'uiRoutes' | 'navItem' | 'guestJoinComponent'>`.
The server manifest spreads the client one (`{ ...clientManifest, apiModule, ... }`) so the UI surface is declared once.
The host never imports the root entry: it would drag `@nestjs/*` into the browser bundle and break `next build`.
Host-side loaders are generated per slug by `packages/core/scripts/generate-module-routes.ts` as static
`import('@quetzal/module-<slug>/client')` calls. A template-string dynamic import is forbidden: webpack turns it into a
context module over the whole `@quetzal/` tree (node_modules included) and the build runs out of memory.
Each module shipped by the host is declared in `apps/host/package.json` dependencies (needed for resolution and typecheck).

## Minimum manifest

```ts
import type { QuetzalModuleManifest } from '@quetzal/core';
import { HelloModule } from './hello.module.js';

export const manifest: QuetzalModuleManifest = {
  slug: 'hello',
  name: { fr: 'Hello', en: 'Hello', es: 'Hola' },
  description: { fr: '...', en: '...', es: '...' },
  version: '0.1.0',
  contractVersion: '1.0.0',
  enabledByDefault: true,
  apiModule: HelloModule,
  eventsPublished: [
    { name: 'hello.greeted', typeRef: 'HelloGreetedEvent' },
  ],
  uiRoutes: [
    { path: '', component: () => import('./ui/page.js'), requiredRoles: ['owner'], layout: 'shell' },
  ],
  navItem: {
    icon: 'sparkles',
    labelKey: 'module.hello.nav.title',
    visibleTo: ['owner', 'creator', 'learner'],
  },
  permissions: {
    'http:GET /api/modules/hello/greet': ['owner', 'creator', 'learner'],
  },
};
```

## Boundary rules (enforced by ESLint + CLAUDE.md §3)

A module may import from:
- `@quetzal/core` — types, event bus, tenant ALS helpers, testing suite
- `@quetzal/ui` — public components
- `@quetzal/i18n` — helpers

A module may NOT:
- Import `PrismaClient` directly from `@prisma/client` — use `getTenantScopedPrisma()` from `@quetzal/core`
- Import `rootPrisma` from `@quetzal/db` — reserved for noyau
- Import cross-module (`@quetzal/module-loto` from `@quetzal/module-quiz` is banned)
- Monkey-patch a noyau service
- Fork a `@quetzal/ui` component locally — propose upstream

Cross-module communication = events on `eventBus`. Event type contracts live in `@quetzal/core/events/<slug>.ts`.

## Naming conventions

| Concept | Convention | Example |
|---|---|---|
| Package | `@quetzal/module-<slug>` | `@quetzal/module-hello` |
| Slug | kebab-case, 3-32 chars, letter-first | `hello`, `spaced-repetition` |
| Prisma models | `<PascalSlug>_<Entity>` | `Hello_Greeting`, `Quiz_Session` |
| Events | `<slug>.<aggregate>.<verb>` (or `<slug>.<verb>`) | `hello.greeted`, `loto.game.started` |
| Event type | `<PascalSlug><PascalVerb>Event` | `HelloGreetedEvent` |
| i18n keys | `module.<slug>.<...>` | `module.hello.nav.title` |
| WS rooms | `<slug>:session:<id>` via `rooms.session()` | `hello:session:s-1` |
| HTTP routes | `/api/modules/<slug>/*` | `/api/modules/hello/greet` |
| WS namespace | `/ws/<slug>` | `/ws/hello` |

## Contract test suite

Every module MUST include `tests/manifest.spec.ts`:

```ts
import { runContractSuite } from '@quetzal/core/testing/index';
import { resolve } from 'node:path';
import { manifest } from '../src/manifest.js';

runContractSuite(manifest, { moduleRoot: resolve(import.meta.dirname, '..') });
```

The suite verifies:
1. Manifest passes Zod validation
2. `contractVersion` major matches `CONTRACT_VERSION` from `@quetzal/core`
3. All published events follow canonical naming regex
4. Each `eventsPublished[].typeRef` is exported from `@quetzal/core/events/<slug>`
5. All Prisma models are prefixed with `<PascalSlug>_` (parsed from `prismaModels` file)
6. i18n key parity across FR/EN/ES (only if `uiRoutes.length > 0`)
7. If `guestAccess.enabled`, permissions include at least one guest entry

## Tenant scope

Any Prisma model with a `tenantId` column is auto-scoped by the tenant-scope extension (see [architecture.md](./architecture.md)). Modules define models with `tenantId String @db.Uuid` and composite `@@id([id, tenantId])`.

Reads/writes go through:

```ts
import { getTenantScopedPrisma } from '@quetzal/core';

const prisma = getTenantScopedPrisma();
await prisma.hello_Greeting.create({ data: { id, userId, message } });
// tenantId injected automatically
```

Attempting to bypass (`prisma.hello_Greeting.create({ data: { tenantId: 't-other', ... } })`) throws `TenantScopeViolationError` at runtime.

## Guest access

Modules opting into guest access declare:

```ts
guestAccess: {
  enabled: true,
  tokenTTL: 7200,           // seconds
  requireDisplayName: true,
  maxConcurrentPerSession: 100,
},
guestJoinComponent: () => import('./ui/guest-join.js'),
permissions: {
  'ws:ping': ['guest'],     // at least one permission entry allows 'guest'
},
```

The host page `/j/<slug>/<sessionId>?tenantId=...` mounts `guestJoinComponent` lazily. The form POSTs to `/api/guest-token` which returns a signed HS256 JWT; the client then connects to the module's WS namespace with `auth.guestToken`.

## Lifecycle hooks (optional)

```ts
onBoot?: (root: RootContext) => Promise<void>       // called once at api boot
onInstall?: (ctx: ModuleContext) => Promise<void>   // when installed for a new tenant (future)
onEnable?: (ctx: ModuleContext) => Promise<void>    // when re-enabled
onDisable?: (ctx: ModuleContext) => Promise<void>   // when disabled
```

`RootContext` has `rootPrisma` (unscoped); `ModuleContext` has scoped `prisma` + `tenantId` + `currentUser`.

## TDD discipline

Per CLAUDE.md §5, module code follows Red/Green/Refactor with two commits per cycle: `test(module-<slug>): ...` then `feat(module-<slug>): ...`. Refactor is a third `refactor(module-<slug>): ...` when applicable. Coverage targets: Domain ≥ 90%, Application ≥ 80%, Infrastructure ≥ 60%.
