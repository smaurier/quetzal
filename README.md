# Quetzal

Plateforme éducative interactive multi-modulaire : un noyau qui expose un contrat de module,
et des modules de jeu branchés dessus (loto, quiz, répétition espacée).

![CI](https://github.com/smaurier/quetzal/actions/workflows/ci.yml/badge.svg)
![Next](https://img.shields.io/badge/Next-15-black)
![NestJS](https://img.shields.io/badge/NestJS-11-ea2845)
![Postgres](https://img.shields.io/badge/Postgres-Prisma-336791)
![pnpm](https://img.shields.io/badge/pnpm-workspaces-f69220)

## État

| Brique | État |
|---|---|
| Noyau (contrat de module, tenant ALS, event bus, invité) | livré, `packages/core` |
| `module-loto` | **en production depuis le 07/09/2026** |
| `module-hello` | stub volontaire, il sert de preuve au contrat de module |
| Quiz, répétition espacée | prévus, pas écrits |

La plateforme est déployée et fonctionne, mais **elle demande un compte** :
[quetzal-theta.vercel.app](https://quetzal-theta.vercel.app) redirige vers l'écran de
connexion. Il n'y a pas de démo publique à visiter sans identifiants, et le dire est plus
utile qu'un lien qui promet autre chose.

## Pourquoi ce découpage

Le pari du projet est qu'une plateforme de jeux éducatifs vieillit mal si chaque jeu est
écrit dans l'application. Ici un jeu est un **module** : il déclare ce qu'il expose, le
noyau l'isole par locataire (`tenant ALS`), lui passe le bus d'évènements et la session,
et `module-hello` existe pour prouver en continu que ce contrat tient sans le jeu réel.
Le détail est dans [Module Contract](docs/module-contract.md).

## Stack

- Next 15 (host, Vercel) + NestJS 11 (api, Render) + Postgres/Prisma (Neon)
- Better-Auth (JWT + organization plugin) + Socket.io + next-intl (FR/EN/ES) + shadcn/ui
- pnpm workspaces + Turborepo

## Setup

```bash
pnpm install
cp .env.example .env.local  # remplir DATABASE_URL, BETTER_AUTH_SECRET, GUEST_TOKEN_SECRET, ...
pnpm --filter @quetzal/db schema:merge
pnpm --filter @quetzal/db generate:tenant-registry
pnpm --filter @quetzal/db exec prisma migrate deploy --schema=prisma/schema.prisma
pnpm --filter @quetzal/db exec prisma generate
pnpm --filter @quetzal/auth seed
pnpm dev
```

`packages/auth/prisma/auth.prisma` est un snapshot versionné de la sortie du CLI Better-Auth. Après toute modification de `packages/auth/src/config.ts` : `pnpm --filter @quetzal/auth generate` puis commit du fichier (la CI échoue sur dérive).

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
  module-loto/   Loto educatif, premier module reel
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

Trois étages, tous lancés par la CI, en plus de `lint`, `typecheck`, d'un
`pnpm audit --prod --audit-level high` et d'un garde-fou qui échoue si le snapshot
Better-Auth a dérivé :

```bash
pnpm turbo run test             # unit
pnpm turbo run test:integration # testcontainers Postgres
pnpm exec playwright test       # E2E (Chromium via pnpm exec playwright install)
```

Le compose `docker-compose.e2e.yml` monte la pile pour les E2E en local.
