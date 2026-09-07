# CLAUDE.md — Conventions Quetzal

> Instructions pour tout agent (Claude, Copilot, humain) travaillant sur ce repo.
> Ces règles priment sur les habitudes générales de l'agent quand elles entrent en conflit.

## 0. Contexte projet

**Quetzal** = plateforme éducative modulaire (modular monolith Next+Nest). Sous-projet en cours : **noyau plateforme + module stub `hello-world`**.

- Spec design de référence : [`docs/superpowers/specs/2026-08-29-quetzal-noyau-design.md`](docs/superpowers/specs/2026-08-29-quetzal-noyau-design.md)
- Branche de développement : `v2` (remplace `main` en fin de sous-projet 1)
- Utilisateur cible MVP : Elda (1 tenant `default`). Commercialisation = plus tard.

## 1. Priorités et garde-fous

- **⛔ Certif RGAA prioritaire jusqu'au 23/10/2026**. Toute session Quetzal = soir/weekend, pas au détriment de la préparation examen.
- **⛔ TDD strict, non négociable** (voir §5).
- **⛔ Aucun secret en git**. `.env` gitignoré (déjà là), rotation manuelle documentée.
- **⛔ Aucun code Givexpert** ne finit ici (repo public).
- **⛔ Chemins absolus** : mentionner le poste (LR/SYLVAIN-PC / LR/lrtechnologies / sylva perso) quand pertinent.

## 2. Structure monorepo

```
quetzal/
├── apps/
│   ├── host/                    # Next 15 App Router — shell UI, router modules
│   └── api/                     # NestJS 11 — HTTP + Socket.io + registry modules
├── packages/
│   ├── core/                    # Contrat module + types partagés + events + testing helpers
│   ├── ui/                      # @quetzal/ui — shadcn/ui surchargé
│   ├── config/                  # ESLint, tsconfig, Tailwind, Prisma helpers
│   ├── auth/                    # Better-Auth config (source de vérité) + seed
│   ├── db/                      # Prisma client + schema mergé + migrations
│   ├── i18n/                    # next-intl setup + catalogues FR/EN/ES
│   └── module-hello/            # Module stub prouvant le contrat
├── docs/
│   ├── architecture.md
│   ├── module-contract.md
│   └── superpowers/specs/
├── turbo.json                   # Orchestration Turborepo
├── pnpm-workspace.yaml
├── render.yaml                  # Config Render pour apps/api
└── CLAUDE.md                    # ← ce fichier
```

Un module = `packages/module-<slug>/` (jamais dans `apps/`).

## 3. Frontière noyau ↔ module (règle fondatrice)

- **Noyau** = tout package hors `packages/module-*` + `apps/*`
- **Module** consomme UNIQUEMENT :
  - `@quetzal/core` (contrat + types + events + testing)
  - `@quetzal/ui` (composants publics)
  - `@quetzal/i18n` (helpers formatage)
- **Interdits absolus** :
  - Import direct entre modules (`@quetzal/module-loto` → `@quetzal/module-quiz` = ❌)
  - Import de `PrismaClient` direct depuis `@prisma/client` dans un module (utiliser `ctx.prisma` scopé)
  - Import de `RootPrismaClient` dans un module (réservé au noyau : onBoot, migrations, jobs admin)
  - Monkey-patch d'un service noyau
  - Fork d'un composant `@quetzal/ui` dans le module (créer un composant local dérivé, ou proposer un ajout upstream)

- **Deux entrées par module** : `./manifest` (serveur, consommé par `apps/api`) et `./client` (`clientManifest: ClientModuleManifest`, consommé par `apps/host`). Le host n'importe JAMAIS l'entrée racine d'un module (elle tire NestJS dans le bundle Next). Chargement host = map statique générée par `generate:routes`, jamais un `import()` à template string sur `@quetzal/module-*` (context module webpack = build OOM). Détail : `docs/module-contract.md`.

- **Sécurité WS** : l'identité WS est résolue **au handshake** par l'adaptateur de la plateforme (`apps/api/src/ws/`), jamais par le module : `auth.token` (JWT utilisateur, rôle lu en base) ou `auth.guestToken` (accepté seulement si `guestAccess.enabled` et pour le module émetteur du jeton). Chaque message est autorisé contre `permissions['ws:<event>']` du manifeste, **fail closed**. Un gateway de module ne déclare ni `cors` ni garde.

Communication cross-module = **événements domain publiés** (event bus) uniquement. Types d'events dans `@quetzal/core/events/<slug>` (contrat public, aucun import du module).

Enforcement : ESLint `no-restricted-imports` + boundaries + custom rules dans `packages/config/eslint/`.

## 4. Clean Architecture

Layers dans `apps/api` ET dans chaque `packages/module-*` :

```
Presentation  → Controllers Nest, Gateways WS, Pages React, DTOs entrée
Application   → Use-cases orchestration
Domain        → Entités, Value Objects, règles métier, événements (pur TS)
Infrastructure→ Prisma repos, Better-Auth adapters, Socket.io, Sentry
```

**Règles de dépendances** (enforced ESLint) :
- Domain ne dépend de RIEN
- Application dépend de Domain seul
- Infrastructure implémente les interfaces (Ports) déclarées dans Domain
- Presentation dépend de Application

**Ports & Adapters** : Domain déclare interface (Port), Infrastructure fournit implémentation (Adapter). Use-case reçoit le Port via injection (pas l'Adapter concret).

## 5. TDD strict (Red / Green / Refactor)

**Non négociable**. Convention formelle :

1. **Red** — écrire le test AVANT toute ligne d'implémentation. Test doit échouer en rouge d'abord.
2. **Green** — code minimum pour passer le test. Rien de plus.
3. **Refactor** — nettoyage sans casser le test. Extraire helpers, renommer, simplifier.

### Commits séparés obligatoires

- 2 commits distincts par cycle TDD :
  - `test(<scope>): <describe test>` — le test rouge
  - `feat(<scope>): <describe feat>` — l'impl qui rend le test vert
- Refactor éventuel = 3e commit : `refactor(<scope>): <describe>`

### Enforcement systémique

- Agent `correcteur-labs` invoqué à chaque jalon (fin sous-projet OU toutes 20-30 commits) audite les derniers commits :
  - Ordre `test:` avant `feat:` respecté ?
  - Chaque `feat:` a bien un `test:` précédent (même scope) ?
  - Verdict : GO / FIX / STOP
- Exception `hotfix-no-tdd` (label PR + issue dette) : test rétroactif à combler avant merge suivant

### Exceptions au cycle test-first (déjà implicites via §11)

La règle « chaque `feat:` a un `test:` précédent » vise les couches où le TDD apporte une vraie valeur : **Domain, Application, Infrastructure (repositories, adapters)**. Trois catégories de commits en sont exemptées, sans disclosure obligatoire dans le body :

1. **Scaffolding / wiring / configuration** — `feat:` qui ne fait qu'assembler des primitives existantes via DI, configuration Nest/Next, plumbing entre modules. Exemples : `scaffold Better-Auth`, `NestJS bootstrap`, `Sentry init`, `Better-Auth handler + authClient`, `global exception filter wiring`. La testabilité utile est en aval (integration ou E2E).
2. **Presentation layer** — Controllers, Gateways, pages/composants React. Couverts par E2E (Playwright, §11) et non par unit test. Cohérent avec « Presentation : pas de seuil » (§5 coverage cibles).
3. **Scripts, seeds, migrations, catalogues JSON** — code one-shot ou déclaratif qui n'a pas d'invariant testable en isolation. Vérification = exécuter le script, pas mocker son environnement. Exemple : `seed.ts`, `merge.ts` catalogues i18n, migrations Prisma générées.

Ces trois catégories sont **couvertes par intégration ou E2E**, pas ignorées. Un `feat:` dans ces zones sans `test:` préalable N'EST PAS une violation §5 et le correcteur-labs doit le tolérer.

Ce qui reste **non négociable** :
- Toute logique métier (Domain, Application, use-case) DOIT avoir son test rouge d'abord.
- Toute correction de bug (`fix:`) qui change un comportement doit soit ajouter un test qui reproduit le bug, soit être flaggée `hotfix-no-tdd` avec issue de dette.
- Les commits `test:` et `feat:` métier restent séparés (§5 ci-dessus).

**Amendement du 05/09/2026 — les interfaces de Port sortent de la liste.** Cette liste nommait « Repository interface ». Un audit correcteur-labs l'a relevé comme divergence entre CLAUDE.md et un plan qui exemptait ces fichiers ; §16 interdit de laisser une divergence muette, donc elle est tranchée ici plutôt qu'ignorée.

Une interface TypeScript sans implémentation n'a aucun comportement à assertir : un test ne pourrait qu'affirmer qu'elle compile, ce que `tsc` fait déjà, et qu'un objet la satisfait, ce que le mot-clé `implements` fait déjà. Sa correction est prouvée deux fois ailleurs — par les adaptateurs qui l'implémentent, testés contre un vrai Postgres, et par les cas d'usage qui la consomment, testés contre des doublures qui la déclarent `implements`. Ajouter un troisième test à cet endroit n'attraperait rien.

Ce qui reste exigé, et ne bouge pas : **le premier adaptateur d'un Port doit arriver en TDD**. Un Port livré sans qu'aucun adaptateur ne soit testé serait un contrat que rien ne tient.

### Coverage cibles

- Domain ≥ 90% (règles métier zéro tolérance)
- Application ≥ 80%
- Infrastructure ≥ 60%
- Presentation : pas de seuil (couvert par E2E)
- **CI bloquant = régression > 5% par PR (delta), pas absolu**

## 6. Design patterns imposés

- **Repository** : chaque agrégat = 1 interface Repository dans Domain + 1 impl `Prisma*Repository` dans Infrastructure
- **Use-case** : 1 classe par action métier, méthode `execute(input)`, retourne `Result<T, E>` ou throw domain error
- **Ports & Adapters** : jamais de dépendance directe Domain → Prisma/Nest/Sentry
- **Registry** : le noyau charge modules via manifest, jamais imports statiques dispersés
- **Event bus** : NestJS EventEmitter2 in-process MVP, subscribers idempotents (dette Redis Streams v2)
- **Value Objects** : encapsuler primitives significatives (`DisplayName`, `Locale`, `TenantId`, `SessionId`)
- **Domain errors** : classes typées (`TenantScopeViolationError`, `GuestQuotaExceededError`), pas de `throw new Error('...')` générique

## 7. Naming conventions

### Fichiers

- Kebab-case : `hello.controller.ts`, `greet.use-case.ts`, `guest-registry.ts`
- Suffixes signifiants : `*.controller.ts`, `*.gateway.ts`, `*.use-case.ts`, `*.repository.ts`, `*.middleware.ts`, `*.spec.ts`, `*.integration.spec.ts`, `*.e2e.spec.ts`
- Tests colocalisés avec source : `greet.use-case.ts` + `greet.use-case.spec.ts` même dossier

### Symboles code

- PascalCase : classes, interfaces, types, enums
- camelCase : variables, fonctions, propriétés
- SCREAMING_SNAKE_CASE : constantes globales (`CONTRACT_VERSION`)
- Préfixe interface pour Ports : `IHelloRepository` interdit → nommer par le rôle : `HelloRepository` (interface) + `PrismaHelloRepository` (impl)

### Prisma modèles

- **Noyau** : PascalCase sans préfixe (`Module`, `TenantModule`, `AuditLog`)
- **Modules** : préfixe `<ModulePascalCase>_` OBLIGATOIRE (`Loto_Game`, `Quiz_Session`, `Hello_Greeting`)
- Enum-like : PAS d'enum Postgres (ALTER TYPE bloquant). String + CHECK constraint SQL + Zod app.

### Events

- Format `<module>.<aggregate>.<event>` : `loto.game.started`, `hello.greeted`, `user.login`
- Types dans `packages/core/src/events/<module-slug>.ts`, nommage `<ModulePascalCase><EventPascalCase>Event` : `LotoGameStartedEvent`, `HelloGreetedEvent`
- Manifest référence le typeRef par nom string : `{ name: 'hello.greeted', typeRef: 'HelloGreetedEvent' }`

### i18n keys

- Hiérarchique par contexte : `common.button.save`, `module.hello.nav.title`, `error.auth.invalid_credentials`
- Namespacing modules : préfixe `module.<slug>.<...>`
- Catalogues : `packages/module-<slug>/src/i18n/{fr,en,es}.json`, parité obligatoire (contract suite vérifie)

### Rooms WS

- Format canonique : `<moduleSlug>:session:<sessionId>` OU `<moduleSlug>:tenant:<tenantId>`
- Helper obligatoire `rooms.session(moduleSlug, sessionId)` — ESLint custom rule `no-raw-room-string`

### URL

- Endpoints métier module : `/api/modules/<slug>/*`
- Auth (Better-Auth) : `/api/auth/*` (Route Handlers Next, PAS rewrité vers Nest)
- Guest token : `/api/guest-token`
- Join guest via QR : `/j/<moduleSlug>/<sessionId>`
- WS namespaces : `/ws/<slug>`

### Rôles

- Nommage code (auth) : `owner` / `admin` (v1.1) / `creator` / `learner` / `guest`
- Nommage UI/i18n : `player` accepté pour désigner un guest côté joueur, sinon même termes

## 8. Conventions code

### TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- Pas de `any` sans commentaire justificatif
- Pas de `as` cast sans typeguard préalable
- Préférer `readonly` sur tableaux/objets immutables (contrat modules = tout `readonly`)
- Types brand pour concepts sensibles : `type UserId = string & { __brand: 'UserId' }`

### Validation

- **Zod partout** (schémas partagés host + api via `@quetzal/core/schemas/*`)
- Nest `ValidationPipe` global avec Zod adapter
- Zéro `class-validator` (double système avec Zod = friction)
- Toute entrée externe (HTTP body/query/params, WS payload, env vars) validée à la frontière

### Immutabilité

- Préférer `const` + spread/map/filter à `let` + mutation
- Domain entities = immuables (nouvelles instances plutôt que setters)

### Erreurs

- Domain errors = classes typées héritant d'une base `DomainError`
- Presentation attrape et mappe vers HTTP status appropriés via ExceptionFilter Nest global
- Jamais de `throw` de string ou objet nu

### Comments

- Défaut = zéro comment
- Comment autorisé UNIQUEMENT pour :
  - Contraintes cachées (invariant non-obvious, workaround bug tiers avec lien issue)
  - Justification d'un `any` ou d'une exception au pattern
- Interdit : commentaires qui décrivent ce que le code fait (le code lui-même doit le dire via nommage)

## 9. Convention DB (Prisma)

- **IDs** : UUID v7 généré app-side via helper `newId()` (`packages/db/src/id.ts`), jamais `@default(uuid())`
- **Timestamps** : `createdAt` + `updatedAt` sur toute table (auto `@updatedAt`)
- **Timezones** : tout UTC en base, conversion locale UI seulement
- **Tenant scope** : toute table métier a une colonne `tenantId String` (typée `@db.Uuid` **quand possible** ; typée plain `String` si elle référence une entité Better-Auth qui utilise plain `String` pour ses IDs, ex : Organization/User de Better-Auth). Les valeurs stockées restent UUID v7 générés par `newId()` dans tous les cas. Clé primaire composite `@@id([id, tenantId])`, index `@@index([tenantId, ...])`, FK vers autres tables tenant-scoped = composite `references: [id, tenantId]`. Modèles noyau `TenantModule`, `AuditLog` = `tenantId String` (pas Uuid) car FK vers `Organization`. Modèles module : `tenantId` et tout `userId` = plain `String` **toujours** (ils référencent Organization/User de Better-Auth, dont les ids ne sont pas des UUID : `Ug58S8t0…`) ; `@db.Uuid` réservé aux ids que le module génère lui-même via `newId()`. Leçon prod du 03/09 : `Hello_Greeting.userId @db.Uuid` → P2023 au premier greet réel.
- **Enums** : String + CHECK constraint SQL + Zod app (jamais `enum` Prisma/Postgres)
- **Nested includes** : autorisés mais couverts par test middleware tenant-scoped
- **Raw SQL** : `$queryRaw` INTERDIT dans modules. Helper `ctx.tenantRawQuery(sql, params)` seul autorisé (refuse sans clause `WHERE tenantId`)
- **Soft delete** : pas d'MVP. Delete physique. Audit via AuditLog.
- **Migrations** : `pnpm --filter @quetzal/db prisma migrate dev --name <name>`. Pas de down migrations. Migration corrective si erreur.

## 10. Convention Git

### Branches

- Branche principale = `main` (remplace legacy après merge `v2`)
- Feature branches : courtes (< 5 jours), nommées `feat/<scope>-<slug>`, `fix/<scope>-<slug>`, `chore/<slug>`
- Merge = squash merge obligatoire (historique linéaire propre sur `main`)
- Rebase interdit sur branches partagées

### Commits — Conventional Commits

- Format : `<type>(<scope>): <subject>` (subject ≤ 50 chars)
- Types autorisés : `feat`, `fix`, `test`, `refactor`, `chore`, `docs`, `style`, `perf`, `ci`, `build`
- Skill `caveman-commit` activé (compression auto)
- **TDD** : commits `test:` DOIT précéder commit `feat:` correspondant (voir §5)
- Body optionnel (why > what), Co-Authored-By en fin
- Jamais `--no-verify` sauf urgence documentée

### PR

- PR obligatoire vers `main` (pas de push direct)
- Description : contexte + changement + test plan
- Reviewer minimum = correcteur-labs à jalons
- CI verte obligatoire pour merge (voir §12)

## 11. Convention tests

### Outillage

- **Vitest** partout (unit + integration)
- **Playwright** E2E
- **testcontainers** pour Postgres réel dans integration
- `msw` pour mock HTTP services externes
- `@vitest/coverage-v8` pour coverage

### Discipline

- Zero `vi.mock('module')` magic hoisting
- Mock des ports via factories manuelles (pas `vi.mock`)
- Snapshots OK uniquement pour petits DTO stables + `auth.prisma` généré (détection drift)
- `describe` par classe, `it` par comportement décrit à la 3e personne
- Factories partagées dans `packages/core/src/testing/factories/`
- Seed helpers : `seedTenant`, `seedGuest`, `seedModule`

### Ne PAS mocker

- Base de données (integration = vrai Postgres via testcontainers)
- Prisma
- Event bus (in-process, testable direct)
- Better-Auth (dépend DB)

### Parallélisation

- Unit : parallèle par défaut
- Integration : `--pool=threads --poolOptions.threads.singleThread` (évite races DB)
- E2E : `fullyParallel: false` MVP

### Convention noms

- `*.spec.ts` = unit
- `*.integration.spec.ts` = integration (needs Postgres)
- `*.e2e.spec.ts` = E2E Playwright
- `manifest.spec.ts` = contract test (chaque module)

## 12. Convention CI/CD

### Jobs GitHub Actions (`.github/workflows/ci.yml`)

| Job | Runtime | Bloque PR |
|---|---|---|
| lint + typecheck (`quality`) | ~30s | ✅ |
| unit (`test-unit`) | ~1min | ✅ |
| contract (`test-contract`) | ~30s | ✅ |
| integration + Postgres | ~3min | ✅ |
| e2e Playwright | ~5min | après 10 runs verts consécutifs |
| security audit (`pnpm audit`) | ~10s | ✅ si high+ |

Cache Turborepo agressif (rerun packages impactés).

### Déploiement

- **Vercel** : preview auto sur PR, prod sur push `main` (host uniquement)
- **Render** : autoDeploy `main`, `predeploy: pnpm --filter @quetzal/db prisma migrate deploy`, `startCommand: node apps/api/dist/main.js`
- **Neon Postgres** : Vercel Marketplace, connection string dans `DATABASE_URL`

## 13. Convention observabilité

### Logs (pino)

- Structured JSON en prod, pino-pretty en dev
- Champs obligatoires : `timestamp, level, requestId, tenantId?, userId?, module?, action?, msg`
- Injection auto via `AsyncLocalStorage` (ne pas propager manuellement)
- **Aucun PII** : email/IP redacted via `logger.redactUser(user)` = `{ userIdHash }`

### Sentry

- Init host (`@sentry/nextjs`) + api (`@sentry/node`), 2 DSN distincts (`SENTRY_DSN_HOST`, `SENTRY_DSN_API`)
- `beforeSend` filter PII obligatoire (email/cookies/authorization → REDACTED)
- Sample tracing 20% prod
- Breadcrumbs enrichis par event bus

### Correlation

- `requestId` UUID v7 généré au 1er middleware, propagé header `x-request-id`, WS handshake, JWT payload, logs, Sentry
- Traçable end-to-end host → api → DB → subscribers

## 14. Anti-patterns explicites (interdits)

- ❌ `PrismaClient` importé direct dans un module (utiliser `ctx.prisma` scopé)
- ❌ `RootPrismaClient` importé dans un module (réservé noyau, ESLint bloque)
- ❌ `$queryRaw` dans un module (helper `ctx.tenantRawQuery` seul autorisé)
- ❌ Import cross-module (`@quetzal/module-loto` → `@quetzal/module-quiz`)
- ❌ Monkey-patch d'un service noyau
- ❌ Enum Postgres (String + CHECK + Zod à la place)
- ❌ JWT dans localStorage (mémoire React uniquement)
- ❌ Cookie custom pour auth Nest (Bearer header via JWT + JWKS)
- ❌ Raw string i18n dans JSX/TSX (ESLint `react/jsx-no-literals` bloque)
- ❌ Raw string room WS (helper `rooms.session()` obligatoire)
- ❌ `vi.mock('module')` magic hoisting
- ❌ Mock de la DB dans les tests (integration = vrai Postgres via testcontainers)
- ❌ `class-validator` (Zod partout)
- ❌ Comment décrivant ce que le code fait (nommage doit le dire)
- ❌ `throw new Error('...')` générique (Domain error typée obligatoire)
- ❌ Skip TDD sans label `hotfix-no-tdd` + issue dette
- ❌ Commit direct sur `main` (PR obligatoire)
- ❌ Force push sur `main` ou `v2` (une fois `v2` mergé)
- ❌ `.env` tracké git
- ❌ Code Givexpert dans ce repo

## 15. Références

### Spec et docs

- Spec design noyau : [`docs/superpowers/specs/2026-08-29-quetzal-noyau-design.md`](docs/superpowers/specs/2026-08-29-quetzal-noyau-design.md)
- Architecture (à écrire) : `docs/architecture.md`
- Contrat module (à écrire) : `docs/module-contract.md`
- Doc didactique privée : `private/quetzal-didactique/` (hub Synapse, hors repo)

### Mémoires Sylvain (contexte utilisateur)

- `user_tdd_codecraft` : TDD priorité max, expliquer le pourquoi
- `user_priorites_roi` : NestJS + BDD = différenciateur marché
- `feedback_correcteur_labs` : validation par agent non-colludé, verdict GO/FIX/STOP
- `project_certif_rgaa` : priorité n°1 jusqu'au 23/10/2026
- `feedback_page_blanche` : objectif = autonomie page blanche, travail assisté ≠ acquis
- `feedback_dates_heures` : vérifier horloge système, jamais extrapoler
- `feedback_chemins_multipostes` : mentionner le poste sur chemins absolus

### Skills disponibles

- `superpowers:brainstorming` (design), `superpowers:writing-plans` (plan), `superpowers:test-driven-development`, `superpowers:verification-before-completion`
- `caveman:caveman-commit` (compression messages commit), `caveman:cavecrew-*` (agents scopés)
- `correcteur-labs` (audit non-colludé)
- Vercel skills : `vercel:nextjs`, `vercel:vercel-functions`, `vercel:auth`, `vercel:shadcn`, `vercel:ai-sdk`, `vercel:knowledge-update`

## 16. Évolution de ces conventions

- Modifications de CLAUDE.md = PR dédiée avec justification
- Chaque violation identifiée doit soit :
  - Amender le code au comportement conforme
  - Amender CLAUDE.md avec justification (règle trop stricte/imprécise)
- Jamais ignorer une violation silencieusement
