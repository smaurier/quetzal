# Architecture — Quetzal Platform

Modular monolith split across two apps and shared packages.

## Runtime layout

```
┌──────────────────┐        ┌──────────────────┐
│  apps/host       │        │  apps/api        │
│  Next 15 (Vercel)│───────▶│  NestJS (Render) │
│                  │  JWT   │                  │
│  - Route Handlers│  bearer│  - Controllers   │
│    /api/auth/*   │        │  - Gateways WS   │
│  - Rewrites →    │        │  - Middlewares   │
│    /api/*, /ws/* │        │    (RequestId,   │
│  - CSP middleware│        │     JWT, Tenant, │
│                  │        │     Throttler)   │
└──────────────────┘        └──────────────────┘
         │                           │
         └───────────┬───────────────┘
                     ▼
              ┌──────────────┐
              │  Neon (PG)   │
              │  tenant-     │
              │  scoped via  │
              │  Prisma      │
              │  $extends    │
              └──────────────┘
```

## Package graph

```
packages/
├── config/           ESLint, tsconfig bases (nextjs, nest, base), Tailwind preset
├── core/             Contract types + Zod + tenant ALS + logger + event bus + guest
├── db/               Prisma client + newId (UUID v7) + tenant-scoped extension
├── auth/             Better-Auth config (org plugin, JWT plugin)
├── ui/               shadcn/ui components + Tailwind globals
├── i18n/             next-intl setup + FR/EN/ES catalogues + merge script
└── module-<slug>/    Domain-driven module (Clean Architecture layers)
```

## Clean Architecture per module

```
module-hello/src/
├── domain/           Pure TS. Entities, VOs, ports (interfaces), errors.
│   ├── greeting.ts
│   ├── errors.ts
│   └── ports/
│       └── greeting.repository.ts
├── application/      Use-cases orchestrate domain + ports.
│   └── greet.use-case.ts
├── infrastructure/   Adapters (Prisma repo, external HTTP, etc.)
│   └── prisma-greeting.repository.ts
├── presentation/     Controllers, Gateways, React UI.
│   ├── hello.controller.ts
│   ├── hello.gateway.ts
│   └── ui/
│       ├── hello-page.tsx
│       └── guest-join.tsx
├── i18n/             Module-scoped FR/EN/ES catalogues (merged at build).
├── hello.module.ts   NestJS DI (wires Controllers + Providers + Repos).
└── manifest.ts       QuetzalModuleManifest (contract).
```

## Tenant isolation (the load-bearing invariant)

Every module DB access goes through `getTenantScopedPrisma()` from `@quetzal/core`. That helper:
1. Reads current tenant from `AsyncLocalStorage` (`tenantStore`)
2. Calls `createTenantScopedClient(rootPrisma, tenantId)` from `@quetzal/db`
3. Returns a Prisma client extended via `$extends` that:
   - Injects `tenantId` into `where` for reads/updates/deletes
   - Injects `tenantId` into `data` for creates/upserts (including `createManyAndReturn`, `updateManyAndReturn`)
   - Throws `TenantScopeViolationError` on cross-tenant attempts
   - Fails closed on unknown Prisma operations (default clause)

Registry of tenant-scoped models is auto-generated at build (`generate-tenant-registry.ts`) by parsing merged `schema.prisma`.

## Boot sequence

1. `apps/api` `main.ts` reads `MODULES` env, dynamically imports each `@quetzal/module-<slug>`
2. Manifests validated (Zod + contract version major match)
3. Modules upserted into `Module` catalog table
4. `RootModule` composed dynamically with `AppModule` + module `apiModule` classes
5. `onBoot(rootContext)` called on each manifest
6. Nest listens on `PORT` (default 3001)

## Event flow

- Domain events published via `eventBus.emit('module.aggregate.event', payload)`
- `InProcessEventBus` wraps EventEmitter2 with wildcard support + per-listener crash isolation + dedup (specific + wildcard subscribers)
- Subscribers register via `eventBus.on(name, handler)` at boot
- `AuditSubscriber` (apps/api) subscribes to a whitelist and writes `AuditLog` rows

## Deployment

| Service | Where | How |
|---|---|---|
| `apps/host` | Vercel | Preview on PR, prod on push `main` |
| `apps/api` | Render Frankfurt | Auto-deploy `main`, `prisma migrate deploy` in preDeploy |
| Postgres | Neon Frankfurt | Provisioned via env `DATABASE_URL` |
| Sentry | 2 DSNs | `SENTRY_DSN_API` (server), `NEXT_PUBLIC_SENTRY_DSN_HOST` (client) |

## Env vars

Required at boot (apps/api):
- `DATABASE_URL` — Neon connection string
- `BETTER_AUTH_SECRET` — 32+ chars (JWT signing)
- `GUEST_TOKEN_SECRET` — 32+ chars (HS256 guest tokens)
- `HOST_URL` — comma-separated CORS origins (also used for JWKS fetch)
- `MODULES` — comma-separated slugs to load (e.g. `hello`)
- `SENTRY_DSN_API` — optional
- `PORT` — default 3001

Host (apps/host) additionally needs:
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_MODULES`
- `NEXT_PUBLIC_SENTRY_DSN_HOST` — optional
