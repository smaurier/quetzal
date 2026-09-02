# Quetzal

Plateforme éducative interactive multi-modulaire (loto, quiz, spaced repetition et plus).

## Stack

- Next 15 (host, Vercel) + NestJS 11 (api, Render) + Postgres/Prisma (Neon)
- Better-Auth (JWT + organization plugin) + Socket.io + next-intl (FR/EN/ES) + shadcn/ui
- pnpm workspaces + Turborepo

## Setup

```bash
pnpm install
cp .env.example .env.local  # remplir DATABASE_URL, BETTER_AUTH_SECRET, GUEST_TOKEN_SECRET, ...
pnpm --filter @quetzal/auth generate
pnpm --filter @quetzal/db schema:merge
pnpm --filter @quetzal/db generate:tenant-registry
pnpm --filter @quetzal/db exec prisma migrate deploy --schema=prisma/schema.prisma
pnpm --filter @quetzal/db exec prisma generate
pnpm --filter @quetzal/auth seed
pnpm dev
```

## Structure

```
apps/
  host/          Next 15 App Router (Vercel)
  api/           NestJS 11 (Render)
packages/
  core/          Contrat module + tenant ALS + logger + event bus + guest
  db/            Prisma + newId (UUID v7) + tenant-scoped extension
  auth/          Better-Auth (org + JWT)
  ui/            shadcn/ui components
  i18n/          next-intl + FR/EN/ES catalogues
  config/        ESLint, tsconfig, Tailwind preset
  module-hello/  Module stub prouvant le contrat
```

## Docs

- [Architecture](docs/architecture.md)
- [Module Contract](docs/module-contract.md)
- [Spec Design (référence)](docs/superpowers/specs/2026-08-29-quetzal-noyau-design.md)
- [Conventions CLAUDE.md](CLAUDE.md)

## Deployment

- Host (Vercel) : preview auto sur PR, prod sur push `main`
- Api (Render Frankfurt) : autoDeploy `main`, `prisma migrate deploy` en preDeploy
- DB (Neon Frankfurt) : provisionné via Vercel Marketplace

## Tests

```bash
pnpm turbo run test             # unit
pnpm turbo run test:integration # testcontainers Postgres
pnpm exec playwright test       # E2E (Chromium via pnpm exec playwright install)
```
