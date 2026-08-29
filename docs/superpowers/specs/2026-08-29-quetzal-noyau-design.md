# Quetzal — Design du noyau plateforme (sous-projet 1)

> **Meta**
> - Auteur : Sylvain Maurier (`sylvain.maurier@gmail.com`)
> - Date : 2026-08-29
> - Branche : `v2` (destinée à remplacer `main` en fin de sous-projet 1)
> - Statut : design validé, prêt pour writing-plans
> - Skill : produit via `superpowers:brainstorming`

## 0. Contexte et intention

Quetzal était un ancien projet stub (NestJS + Mongoose backend, Next.js frontend template create-next-app) déployé sur `quetzal-theta.vercel.app` (front Vercel) + `quetzal.onrender.com` (back Render, Mongo Atlas). Le code métier était quasi vide : un seul module `items` de test, aucune vraie feature. L'existant est jeté intégralement, la refonte repart from scratch sur la branche `v2`.

**Vision** : plateforme éducative modulaire (modular monolith, alpha full-stack unifié) sur laquelle brancher des modules pédagogiques indépendants (loto, quiz Kahoot-like, spaced repetition/neurosciences, etc.). Le sous-projet 1 livre uniquement le **noyau + un module stub `hello-world`** prouvant que le contrat de module fonctionne bout en bout.

**Public visé** : Elda (femme de Sylvain, prof d'espagnol, utilisatrice unique MVP) puis potentiellement clients tiers en cas de commercialisation.

**Garde-fou actif** : certif RGAA prioritaire jusqu'au 23/10/2026 (mémoire `project_certif_rgaa`). Le sous-projet 1 assume une pause implicite ou un travail soir/weekend selon avancement RGAA.

## 1. Scope du sous-projet 1

### Livrables

1. Monorepo pnpm + Turborepo cadré (`apps/host`, `apps/api`, `packages/core`, `packages/ui`, `packages/config`, `packages/auth`, `packages/db`, `packages/i18n`, `packages/module-hello`)
2. Authentification Better-Auth (rôles owner + creator + learner + guest tokens), org = tenant dormant, seed compte Elda
3. Base Postgres via Prisma + Neon Marketplace, `tenantId` partout, migration initiale
4. Contrat de module (interface TypeScript partagée) + module stub `hello-world` prouvant le contrat (Nest gateway + composant React lazy-loadé dans host)
5. Shell UI host (layout, sidebar de modules activés, page dashboard, page login)
6. i18n next-intl 3 langues (FR/EN/ES) : infrastructure + catalogue FR complet, EN + ES scaffold
7. Design system `@quetzal/ui` = 5-8 composants shadcn essentiels (Button, Dialog, Input, Toast, Card, Sheet, Form)
8. Pipeline CI GitHub Actions (lint + typecheck + Vitest + Playwright smoke sur PR, deploy preview Vercel/Render)
9. `CLAUDE.md` conventions (SOLID/KISS/DRY/TDD/Clean Architecture/patterns nommage)
10. Doc `README` + `docs/architecture.md` + `docs/module-contract.md` à jour

### Non-goals explicites

Voir section 8 pour la liste exhaustive. Résumé : aucun vrai module (loto/quiz/neuro), aucun signup public, aucune UI multi-tenant, aucune facturation, aucun panel super-admin, aucun SMS/Twilio, aucune analytique métier, aucune notification email/push, aucun file upload, aucun Redis (reporté sous-projet 2), aucun hot-reload modules runtime.

### Critère de succès (répété section 8.4)

Elda se logue sur host, voit le shell UI, voit `hello-world` dans la sidebar, clique, une page module s'affiche, une action HTTP répond, une action WS répond, un guest peut rejoindre via QR. Le contrat est prouvé.

## 2. Architecture haut niveau

### Structure monorepo

```
quetzal/
├── apps/
│   ├── host/                    # Next 15 App Router, shell UI, router de modules
│   └── api/                     # NestJS, HTTP + Socket.io gateways, orchestration modules
├── packages/
│   ├── core/                    # Contrat module, types partagés, DTOs, événements domain
│   ├── ui/                      # @quetzal/ui — shadcn/ui + composants surchargés
│   ├── config/                  # ESLint, tsconfig base, Tailwind preset, Prisma helpers
│   ├── auth/                    # Better-Auth setup partagé host+api, guards, hooks
│   ├── db/                      # Client Prisma + schema.prisma + migrations + seed
│   ├── i18n/                    # next-intl setup + catalogues FR/EN/ES
│   └── module-hello/            # Module stub prouvant le contrat (jeté quand module-loto prêt)
├── turbo.json
├── pnpm-workspace.yaml
├── render.yaml
└── docs/
    ├── architecture.md
    ├── module-contract.md
    └── superpowers/specs/
```

### Layers Clean Architecture (appliqués dans apps/api ET dans chaque packages/module-*)

```
┌─────────────────────────────────────────────┐
│ Presentation  (Nest controllers, gateways,  │  ← HTTP/WS, DTOs entrée
│                Next pages/components)        │
├─────────────────────────────────────────────┤
│ Application   (use-cases, orchestration)    │  ← StartGameUseCase
├─────────────────────────────────────────────┤
│ Domain        (entités, VOs, règles,        │  ← Pur TS, zéro dep framework
│                événements)                   │
├─────────────────────────────────────────────┤
│ Infrastructure (Prisma repos, Better-Auth,  │  ← Adapters concrets
│                 Socket.io adapter, Neon)     │
└─────────────────────────────────────────────┘
```

**Règles de dépendances** (enforced via ESLint boundaries) :
- Domain ne dépend de RIEN
- Application dépend de Domain seul
- Infrastructure dépend de Domain (implémente ses interfaces = pattern Ports & Adapters)
- Presentation dépend d'Application

Patterns utilisés : Repository, Use-case, Ports & Adapters, Registry (contrat module).

### Surfaces d'exécution

- **`apps/host`** (Vercel) : Next 15 App Router, RSC pour données statiques, Client Components pour interactivité, `socket.io-client` pour temps réel, connecté à `apps/api` via HTTP + WS
- **`apps/api`** (Render) : NestJS 11 monolithique, charge les modules du monorepo au démarrage (registry), expose `/api/*` HTTP et namespaces WS `/ws/<module-slug>`

### Communication host ↔ api

- HTTP JSON pour CRUD, auth Better-Auth (Route Handlers Next côté host), JWT Bearer vers Nest
- Socket.io pour temps réel (namespaces par module)
- CORS strict, cookies session Better-Auth restent 1st-party via Next rewrite selectif

**Pas de gRPC, tRPC, GraphQL**. REST + WS suffisent, YAGNI le reste.

## 3. Contrat de module (v1.0)

### Frontière noyau ↔ module (règle fondatrice)

- **Noyau** = `packages/core`, `packages/auth`, `packages/db`, `packages/ui`, `packages/i18n`, `apps/host`, `apps/api`
- **Module** = tout package `@quetzal/module-*`
- Un module consomme uniquement les APIs exportées par `@quetzal/core` et les hooks/composants publics de `@quetzal/ui`
- Un module ne fork jamais le noyau, ne monkey-patch aucun service noyau, n'importe rien d'un autre module
- Rupture de cette règle = fin de la modularité → ESLint boundaries bloque à la compilation

### Isolation stricte inter-modules

- Import direct entre modules interdit (ESLint `no-restricted-imports`)
- Communication cross-module = événements domain publiés (event bus) uniquement
- Chaque module s'abonne aux événements qui l'intéressent et projette ses propres données (pattern CQRS light)
- Aucune dépendance topologique entre modules → boot order libre

### Interface principale

```ts
// packages/core/src/module-contract.ts
export const CONTRACT_VERSION = '1.0.0' as const;

export type QuetzalRole = 'owner' | 'creator' | 'learner' | 'guest';
export type Locale = 'fr' | 'en' | 'es';

export interface QuetzalModuleManifest {
  // === Identité ===
  slug: string;                              // 'loto' — kebab-case, unique, immuable
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  version: string;                           // semver du module
  contractVersion: `${number}.${number}.${number}`;

  // === Activation ===
  enabledByDefault: boolean;

  // === Backend ===
  apiModule: Type<INestModule>;
  eventsPublished: readonly EventDefinition[];
  eventsSubscribed?: readonly EventSubscription[];

  // === Frontend ===
  uiRoutes: readonly QuetzalRoute[];
  navItem: QuetzalNavItem | null;
  guestJoinComponent?: () => Promise<{ default: ComponentType<GuestJoinProps> }>;

  // === Sécurité ===
  permissions: PermissionMatrix;
  guestAccess?: GuestAccessConfig;
  rateLimits?: RateLimitConfig;

  // === Persistance ===
  prismaModels?: string;                     // chemin fichier .prisma, préfixe convention

  // === Config runtime ===
  configSchema?: ZodSchema;                  // valide TenantModule.config

  // === Lifecycle ===
  onBoot?: (root: RootContext) => Promise<void>;      // 1x au démarrage app, cross-tenant
  onInstall?: (ctx: ModuleContext) => Promise<void>;  // 1re activation par un tenant
  onEnable?: (ctx: ModuleContext) => Promise<void>;   // chaque activation ensuite
  onDisable?: (ctx: ModuleContext) => Promise<void>;  // désactivation par tenant
}

export interface EventDefinition {
  name: EventName;                           // 'hello.greeted'
  typeRef: string;                           // nom exporté depuis @quetzal/core/events/<slug>
}

export interface RootContext {
  logger: Logger;
  config: ReadonlyConfig;
  eventBus: EventBus;
  prisma: RootPrismaClient;                  // 🚨 NON scopé — usage restreint (onBoot, migrations)
}

export interface ModuleContext {
  logger: Logger;
  config: ReadonlyConfig;
  eventBus: EventBus;
  tenantId: string;                          // TOUJOURS présent
  prisma: TenantScopedPrismaClient;          // ✅ auto-scopé
  currentUser?: {
    id: string;
    role: QuetzalRole;
    locale: Locale;
  };
}

export interface QuetzalRoute {
  path: string;                              // '', 'admin', 'play/:sessionId'
  component: () => Promise<{ default: ComponentType }>;
  requiredRoles: readonly QuetzalRole[];
  layout: 'shell' | 'full';                  // 'full' = mobile joueur, pas de sidebar
}

export interface QuetzalNavItem {
  icon: string;                              // lucide-react
  labelKey: string;                          // clé i18n
  visibleTo: readonly QuetzalRole[];
  order?: number;
}

export type PermissionMatrix = Record<string, readonly QuetzalRole[]>;
// Clé : 'http:METHOD /path' ou 'ws:eventName'

export interface GuestAccessConfig {
  enabled: boolean;
  tokenTTL: number;                          // secondes
  requireDisplayName: boolean;
  maxConcurrentPerSession: number;
}

export interface RateLimitConfig {
  default: { requests: number; windowMs: number };
  perEndpoint?: Record<string, { requests: number; windowMs: number }>;
}

export type EventName = `${string}.${string}` | `${string}.${string}.${string}`;

export interface EventSubscription {
  event: EventName;
  handler: (ctx: ModuleContext, payload: unknown) => Promise<void>;
}
```

### Guest Token (spec cryptographique)

```ts
// JWT signé HMAC-SHA256 avec GUEST_TOKEN_SECRET (env, distinct de auth secret)
interface GuestTokenPayload {
  tenantId: string;
  sessionId: string;
  guestId: string;                           // UUID v7 généré à l'entrée
  displayName: string;                       // max 32 chars, sanitized
  moduleSlug: string;
  iat: number;
  exp: number;                               // iat + module.guestAccess.tokenTTL
}
```

Émission : endpoint public `POST /api/guest-token` avec `{ tenantId, sessionId, moduleSlug, displayName }` → valide que le module accepte guests, que la session existe, retourne JWT. Guard `GuestGuard` côté Nest vérifie le token, injecte `guest` role dans req.

### Deux clients Prisma (sécurité tenant)

```ts
// packages/db/src/clients.ts

export type RootPrismaClient = PrismaClient & { readonly __brand: 'root' };
export type TenantScopedPrismaClient = ReturnType<typeof createTenantScopedClient>;

export function createTenantScopedClient(
  root: RootPrismaClient,
  tenantId: string,
): PrismaClient {
  return root.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (modelHasTenantId(model)) {
            args = applyTenantConstraint(args, operation, tenantId);
            // - reads : merge where.tenantId ; throw si where.tenantId ≠ ctx
            // - create/upsert : throw si data.tenantId ≠ ctx, sinon inject
            // - update/delete : throw si where.tenantId ≠ ctx, sinon inject
            // - createMany : boucle sur chaque item
          }
          return query(args);
        },
      },
    },
  }) as PrismaClient;
}
```

**Comportement** :
- `data.tenantId` absent → injection silencieuse
- `data.tenantId === ctx.tenantId` → passthrough
- `data.tenantId !== ctx.tenantId` → throw `TenantScopeViolationError` (log + alert Sentry)
- Idem `where.tenantId`

**Lookup `modelHasTenantId`** : généré au build via parsing `schema.prisma` mergé. Régénéré à chaque `pnpm install` + `pnpm prebuild`.

**Raw SQL** : `$queryRaw` interdit dans modules (ESLint). Helper `ctx.tenantRawQuery(sql, params)` refuse toute requête sans clause `WHERE tenantId = $tenantId` (parser regex simple).

**Cache clients scopés** : LRU max 1000 tenants, TTL 5min inactivité.

### Registry — ce que le noyau fait automatiquement

1. Validation `contractVersion` compatible avec `CONTRACT_VERSION` (majeur strict, mineur descendant OK) — refuse chargement sinon
2. Nommage Prisma vérifié : préfixe `<ModulePascalCase>_` obligatoire
3. Montage backend : `apiModule` monté sous `/api/modules/<slug>/*`, gateways WS sous `/ws/<slug>`
4. Génération routes Next au build : script `packages/core/scripts/generate-module-routes.ts` génère `apps/host/app/modules/[slug]/[...path]/page.tsx` (re-export composant lazy) → RSC/SSR OK
5. HMR dev : watcher chokidar sur `packages/module-*/src/manifest.ts` régénère + Turbopack pick up
6. Sidebar auto : items filtrés par `visibleTo` vs rôle courant, triés par `order`
7. Guards chaînés : `JwtAuthMiddleware` (ou `GuestGuard`) → `TenantMiddleware` (ALS scope) → `RoleGuard` (matcheur `permissions[endpoint]`) → `RateLimitGuard`
8. Merge Prisma au build : script concat des `prisma/models.prisma` de tous modules + schema noyau → `packages/db/prisma/schema.prisma` généré
9. Event bus : subscriptions enregistrées, MVP = NestJS `EventEmitter2` in-process, dette Redis Pub/Sub dès 2e instance

### Contract Test Suite (livrable jour 1)

`packages/core/src/testing/contract-suite.ts` exporte `runContractSuite(manifest)` qui vérifie :

- Manifest schema Zod valide
- `contractVersion` compatible
- `slug` regex `/^[a-z][a-z0-9-]{2,31}$/`
- Modèles Prisma préfixés `<PascalCase>_`
- Types événements publiés existent dans `@quetzal/core/events/<slug>`
- i18n keys présentes dans les 3 locales (parité fr/en/es)
- Si `guestAccess.enabled` → au moins un endpoint autorise `guest`
- Nommage events `<module>.<aggregate>.<event>`
- Tenant-isolation : 2 tenants A/B, insert via ctx.prisma, findMany(A) ne voit jamais B
- Bypass attempt : `where: { tenantId: 'other' }` explicite → throw

Chaque module a `tests/manifest.spec.ts` qui appelle `runContractSuite(manifest)`. CI bloque si ça casse.

**v1.1** : décorateurs Nest `@ModulePermission()` remplacent matrix manuelle + introspection endpoints (permissions couvrent 100%).

### Structure type d'un module

```
packages/module-loto/
├── package.json                  # "@quetzal/module-loto"
├── prisma/models.prisma          # Loto_Game, Loto_Ticket (préfixe obligatoire)
├── src/
│   ├── domain/                   # pur, zéro framework
│   ├── application/              # use-cases
│   ├── infrastructure/           # PrismaLotoGameRepository, RedisPubSubAdapter
│   ├── presentation/
│   │   ├── loto.controller.ts    # HTTP
│   │   ├── loto.gateway.ts       # WS
│   │   └── ui/
│   │       ├── admin.page.tsx    # animateur
│   │       ├── play.page.tsx     # joueur mobile
│   │       └── components/
│   ├── i18n/{fr,en,es}.json
│   ├── loto.module.ts            # NestJS DynamicModule
│   └── manifest.ts               # export const manifest: QuetzalModuleManifest
├── tests/
│   └── manifest.spec.ts          # runContractSuite(manifest)
└── vitest.config.ts
```

### Module stub `hello-world` — livrable sous-projet 1

- 1 endpoint HTTP `GET /modules/hello/greet` → `{ msg: "Hello ${user.name}", tenantId }`
- 1 gateway WS `ping` → répond `pong` avec latence
- 1 page React `/modules/hello` : bouton "Greet" + bouton "Ping", affiche résultats
- Permissions : `owner`/`creator`/`learner` sur greet ; `guest` autorisé sur ping via `guestAccess`
- 1 événement publié : `hello.greeted`
- Tests : contract + unit + integration + Playwright E2E (2 users simultanés)

Prouve les 3 axes : HTTP+guards+tenant, WS+guest, front lazy.

### Roadmap contrat (dette assumée)

| Version | Contenu |
|---|---|
| v1.0 | Ci-dessus (MVP) |
| v1.1 | Décorateurs `@ModulePermission()` (backward-compat), endpoints introspection, `storage?: StorageAdapter` dans ctx |
| v2.0 | Event bus distribué (Redis Streams), breaking sur `EventBus.emit` |
| v3.0 | Plugin hot-reload runtime (probablement YAGNI) |

## 4. Modèle de données noyau

### Conventions transverses

- **IDs** : UUID v7 généré app-side via `uuid@10+` (`uuidv7()` — helper `newId()` dans `packages/db/src/id.ts`). Prisma : pas de `@default`, valeur fournie par l'app.
- **Timestamps** : `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt` partout.
- **Soft delete** : PAS d'MVP. Delete physique. Audit via `AuditLog`. YAGNI le reste.
- **Nommage** : PascalCase modèles, camelCase champs. Modèles noyau sans préfixe. Modèles module avec préfixe `<ModulePascalCase>_`.
- **Timezones** : tout en UTC en base, conversion locale UI seulement.
- **Enums** : PAS d'enum Postgres (ALTER TYPE bloquant). `String @db.VarChar(32)` + CHECK constraint SQL + Zod validation app.

### Deux familles de tables

**A — Tables plateforme globales** (pas de `tenantId`) : gérées par `RootPrismaClient` uniquement. Better-Auth models + mes 3 tables plateforme.

**B — Tables tenant-scoped** (colonne `tenantId` obligatoire) : gérées par `TenantScopedPrismaClient`. FK inter-tables via clés composites `(id, tenantId)`. Zéro table noyau ici pour MVP, tout appartient aux modules.

### Better-Auth = source de vérité

Better-Auth CLI génère `packages/auth/prisma/auth.prisma`. Alias sémantique :
- Better-Auth `Organization` = notre **Tenant**
- Better-Auth `Member` = notre **OrgMembership**
- User/Session/Account/Verification/Invitation = Better-Auth

Rôles Better-Auth déclarés dans plugin `organization` :

```ts
// packages/auth/src/config.ts
import { betterAuth } from 'better-auth';
import { organization, jwt } from 'better-auth/plugins';
import { prismaAdapter } from 'better-auth/adapters/prisma';

export const auth = betterAuth({
  database: prismaAdapter(rootPrisma, { provider: 'postgresql' }),
  user: {
    additionalFields: {
      locale: { type: 'string', defaultValue: 'fr' },
    },
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: false,   // MVP : seul le seed
      organizationLimit: 1,                    // MVP : 1 tenant par user
      membershipLimit: 100,
      roles: {
        owner: { permissions: ['*'] },
        admin: { permissions: ['tenant.manage', 'module.configure'] },  // v1.1
        creator: { permissions: ['content.create', 'session.launch'] },
        learner: { permissions: ['content.consume'] },
      },
    }),
    jwt({
      jwks: { keyPairConfig: { alg: 'RS256' } },
      jwt: {
        expirationTime: '1h',
        definePayload: async ({ session, user }) => ({
          userId: user.id,
          tenantId: session.activeOrganizationId,
          role: session.activeMemberRole,
          locale: user.locale,
        }),
      },
    }),
  ],
  emailAndPassword: {
    enabled: true,
    password: { hash: 'scrypt' },              // défaut Better-Auth
  },
});
```

### Mes 3 tables plateforme (`packages/db/prisma/core.prisma`)

```prisma
model Module {
  slug             String   @id @db.VarChar(64)
  version          String   @db.VarChar(32)
  contractVersion  String   @db.VarChar(32)
  enabledByDefault Boolean  @default(false)
  metadata         Json                              // snapshot i18n
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
  config      Json?                             // validé par module.configSchema

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

  user        User?         @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([tenantId, createdAt])
  @@index([userId, createdAt])
  @@index([action])
}
```

### Convention modules (tables tenant-scoped)

```prisma
model Loto_Game {
  id         String    @db.Uuid                     // UUID v7 app-side
  tenantId   String    @db.Uuid
  status     String    @db.VarChar(32) @default("pending")
  createdBy  String    @db.Uuid                     // userId
  createdAt  DateTime  @default(now())

  tickets    Loto_Ticket[]

  @@id([id, tenantId])                              // clé composite = FK safe
  @@index([tenantId, status])
}

model Loto_Ticket {
  id         String   @db.Uuid
  tenantId   String   @db.Uuid
  gameId     String   @db.Uuid

  game       Loto_Game @relation(fields: [gameId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@id([id, tenantId])
  @@index([tenantId, gameId])
}

// + CHECK constraint SQL raw pour valeurs valides
```

**Règles Prisma pour modules (contract test check)** :
1. Toute table tenant-scoped a `tenantId String @db.Uuid`
2. Clé primaire = composite `@@id([id, tenantId])`
3. Toute FK vers autre table tenant-scoped = composite `references: [id, tenantId]`
4. Index `@@index([tenantId, ...])` sur clés d'accès fréquentes
5. Préfixe modèle `<ModulePascalCase>_`
6. Champs enum-like = `String` + CHECK constraint SQL

### TenantMiddleware — ALS (AsyncLocalStorage) pattern

```ts
// packages/core/src/tenant/tenant-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantExecutionContext {
  tenantId: string;
  userId?: string;
  role?: QuetzalRole;
  requestId: string;
}

export const tenantStore = new AsyncLocalStorage<TenantExecutionContext>();

export function getCurrentTenant(): TenantExecutionContext {
  const ctx = tenantStore.getStore();
  if (!ctx) throw new Error('No tenant context — code appelé hors requête ?');
  return ctx;
}
```

```ts
// apps/api/src/tenant/tenant.middleware.ts
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const auth = (req as any).authContext;      // posé par JwtAuthMiddleware
    tenantStore.run(
      {
        tenantId: auth.tenantId,
        userId: auth.userId,
        role: auth.role,
        requestId: (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
      },
      () => next(),
    );
  }
}
```

Repositories importent `getTenantScopedPrisma()` qui lit `tenantStore` et retourne le client scopé depuis le pool LRU. Aucun `REQUEST` scope Nest = perf singleton.

### Seed initial

`packages/db/prisma/seed.ts` :
- Passe par Better-Auth API (pas Prisma direct, respecte hashing scrypt)
- `auth.api.signUpEmail({ email: SEED_OWNER_EMAIL, password: SEED_OWNER_PASSWORD, name: 'Elda' })`
- Création tenant `default` : le seed écrit directement dans la table `Organization` via `RootPrismaClient` (le flag `allowUserToCreateOrganization: false` ne s'applique qu'à l'API user-facing Better-Auth, pas à un accès DB privilégié serveur). Le seed est le seul endroit autorisé à faire ça.
- `auth.api.addMember({ userId, organizationId, role: 'owner' })`
- Enregistre module `hello-world` dans catalogue `Module` + row `TenantModule` active pour tenant `default`

### Migrations strategy

- Convention : `packages/db/prisma/migrations/` versionné git
- Nouveau module ajoute des tables : `pnpm --filter @quetzal/db prisma migrate dev --name add-<module-slug>`
- Merge schemas script régénère `schema.prisma` global avant `prisma migrate`
- Prod : `prisma migrate deploy` en pre-deploy hook Render (`render.yaml`), **pas au boot** (évite race concurrente)
- Rollback : "no down migrations", création d'une migration corrective si besoin

### Extensions Postgres

- MVP : aucune extension custom nécessaire (UUID v7 généré app-side, pas de fonction SQL custom).
- `uuid-ossp` : PAS requis pour MVP (colonne `@db.Uuid` = type Postgres natif, pas besoin de générateur SQL). À activer uniquement si un futur module en a besoin (ex : `uuid_generate_v4()` côté SQL).
- `pgcrypto` : anticipé pour chiffrement colonne futur, non installé MVP.
- Neon supporte `uuid-ossp` et `pgcrypto` dans sa liste blanche standard.

## 5. Data flow

### Scénario 0 — Boot de l'application

```
[apps/api démarre]
  │
  ├─ Lit MODULES env → ['hello']
  ├─ Import dynamique manifests
  ├─ Validation runContractSuite(manifest) → throw si invalide
  ├─ Registry.build() compose AppModule Nest
  ├─ Prisma migrate deploy déjà fait (pre-deploy Render)
  ├─ RootContext.eventBus.emit('platform.boot')
  ├─ for each module: manifest.onBoot?.(rootContext)
  │    └─ upsert Module row
  └─ Server listen :3001

[apps/host démarre]
  │
  ├─ Next lit NEXT_PUBLIC_MODULES → ['hello']
  ├─ Build script generate-module-routes.ts a déjà généré les pages
  ├─ Turbopack HMR sur changement manifest (via watcher chokidar)
  └─ Server listen :3000
```

### Scénario 1 — Elda se logue

```
Elda ouvre https://quetzal.app/login
  ├─ Next RSC render <LoginPage /> (Client Component form)
  │
Elda soumet email + password
  ├─ Next Route Handler POST /api/auth/sign-in (Better-Auth)
  │    ├─ Vérifie credentials via Prisma (User + Account scrypt)
  │    ├─ Crée Session + JWT signé RS256
  │    ├─ Set-Cookie: better-auth.session_token (HttpOnly, SameSite=Lax, 1st-party)
  │    ├─ activeOrganizationId stocké dans Session record (pas cookie séparé)
  │    └─ Return 200 { user, session }
  │
  ├─ Middleware audit: AuditLog.create({ action: 'user.login', ... })
  │
Client redirect /dashboard
  └─ Next RSC dashboard rend sidebar avec TenantModule.findMany scopé
```

### Scénario 2 — Elda clique "Greet" (HTTP scopé)

```
Client Component :
  const { token } = await authClient.getToken();
  fetch('/api/modules/hello/greet', {
    headers: { Authorization: `Bearer ${token}` }
  });
  │
  ├─ Next rewrite '/api/modules/*' → https://quetzal-api.onrender.com/api/modules/*
  │
Nest middleware chain :
  1. RequestIdMiddleware  → x-request-id header
  2. JwtAuthMiddleware    → verify JWT via JWKS remote, cache 24h
                             extract { userId, tenantId, role, locale }
  3. TenantMiddleware     → tenantStore.run(...)
  4. RateLimitMiddleware  → check permissions['http:GET /greet'].rateLimit
  │
Nest router → HelloController.greet(@CurrentUser() user)
  ├─ GreetUseCase.execute(user.name)
  │    ├─ ctx.prisma.hello_Greeting.create({ data: { userId, message } })
  │    │    → middleware $extends inject tenantId auto
  │    ├─ ctx.eventBus.emit('hello.greeted', { userId, tenantId, requestId })
  │    │    → EventEmitter2 in-process
  │    └─ return { msg: `Hello ${name}`, tenantId, requestId }
  │
  └─ return 200 JSON
```

### Scénario 3 — Elda clique "Ping" (WS user)

```
Client :
  const socket = io('/ws/hello', { auth: { token: jwt } });
  │
  ├─ Handshake WS via Next rewrite → Render (upgrade HTTP → WS)
  │
Nest WsJwtGuard :
  ├─ Verify JWT via JWKS
  ├─ Inject { userId, tenantId, role, locale } sur socket.data
  ├─ tenantStore.run(...)
  └─ Accept upgrade
  │
socket.emit('ping', { at: Date.now() })
  │
HelloGateway.@SubscribeMessage('ping') :
  ├─ RateLimit check
  ├─ Compute latency
  ├─ ctx.eventBus.emit('hello.pinged', { userId, tenantId, latencyMs })
  └─ socket.emit('pong', { latencyMs, serverAt: Date.now() })
```

### Scénario 4 — Guest rejoint session via QR

```
Elda crée session :
  POST /api/modules/hello/sessions
  → { sessionId, joinUrl: 'https://quetzal.app/j/hello/abc123' }
  → QR code affiché côté animateur

Joueur scanne QR, ouvre /j/hello/abc123 :
  ├─ Page noyau /j/[moduleSlug]/[sessionId]/page.tsx (Client Component, layout 'full')
  ├─ Rend <GuestJoinShell> qui monte manifest.guestJoinComponent
  │
Joueur saisit "Bob", submit :
  ├─ POST /api/guest-token
  │    body: { tenantId, sessionId, moduleSlug, displayName: 'Bob' }
  │
Middleware chain (pas d'auth JWT, chain custom) :
  1. IpRateLimitMiddleware (100/h/IP)
  2. GuestTokenValidator (tenantId + module actif + accepte guests)
  3. GuestRegistryCheck (count < maxConcurrentPerSession)
  4. Sign HMAC JWT
  5. AuditLog 'guest.joined'
  6. Return { token, guestId }
  │
Client stocke token en mémoire, ouvre WS :
  const socket = io('/ws/hello', { auth: { guestToken: token } });
  │
Nest WsGuestGuard :
  ├─ verify HMAC signature, valide exp + moduleSlug
  ├─ socket.data = { role: 'guest', tenantId, guestId, sessionId, displayName }
  ├─ socket.join(rooms.session('hello', sessionId))
  └─ Accept
```

Broadcast animateur → guests :

```
POST /api/modules/hello/sessions/abc123/broadcast
  └─ HelloGateway.server.to(rooms.session('hello', 'abc123')).emit('greeting', {...})
```

### Scénario 5 — Événement domain écouté

```
ctx.eventBus.emit('hello.greeted', payload)
  │
NestJS EventEmitter2 dispatche in-process (at-most-once MVP) :
  ├─ AuditLogSubscriber.@OnEvent(whitelist)   → AuditLog.create()
  ├─ ObservabilitySubscriber.@OnEvent('*.*')  → Sentry breadcrumb + pino log
  └─ [Futur] Autres modules écoutent via type import @quetzal/core/events/hello
```

Subscribers idempotents par convention (dette Redis Streams v2.0 = at-least-once).

### Rewrite Next selective

```ts
// apps/host/next.config.ts
rewrites: [
  { source: '/api/modules/:path*',  destination: `${API}/api/modules/:path*` },
  { source: '/api/guest-token',     destination: `${API}/api/guest-token` },
  { source: '/api/audit/:path*',    destination: `${API}/api/audit/:path*` },
  { source: '/api/health',          destination: `${API}/api/health` },
  { source: '/ws/:path*',           destination: `${API}/ws/:path*` },
  // '/api/auth/*' → Route Handlers Next (Better-Auth), PAS rewrité
  // '/api/jwks'   → Route Handler Next expose JWKS public
]
```

Règle : métier + realtime → Nest/Render. Auth + Next-native → host.

### Conventions imposées

- **Rooms WS** : helper `rooms.session(moduleSlug, sessionId)` = `${moduleSlug}:session:${sessionId}`. ESLint custom rule `no-raw-room-string`.
- **URL join guest** : `/j/<moduleSlug>/<sessionId>` = page noyau
- **Audit whitelist** : `['user.login', 'user.logout', 'user.signup', 'guest.joined', 'guest.left', 'guest.kicked', 'session.created', 'session.ended', 'module.installed', 'module.enabled', 'module.disabled', 'audit.security.*']`

## 6. Cross-cutting concerns

### 6.1 i18n

- **Stack** : `next-intl` (host) + `packages/i18n` (catalogues + helpers) + `User.locale` (fr/en/es)
- **Zéro string en dur** : ESLint `react/jsx-no-literals` + custom rule TS
- **Namespacing modules** : `packages/module-<slug>/src/i18n/<locale>.json`, merge au build
- **Résolution locale** : (1) `User.locale`, (2) cookie `NEXT_LOCALE`, (3) `Accept-Language`, (4) `fr` fallback
- **Propagée dans JWT** → messages d'erreur Nest i18n
- **Formatage** : `Intl.DateTimeFormat` + `Intl.NumberFormat` natifs
- **Switch UI** : `<LocaleSwitcher />` shell → PATCH `User.locale` + reload
- **Catalogues MVP** : FR + EN + ES **remplis** dès jour 1 (choix I3+, traduction ES par Elda, EN par Sylvain)
- **Contract test** : refuse un module dont catalogue de locale manque une clé

### 6.2 Observabilité

**Logs (pino)** :
- Champs obligatoires : `timestamp, level, requestId, tenantId?, userId?, module?, action?, msg`
- Injection auto via ALS
- Dev = pino-pretty, prod = JSON → Render logs → Vercel Log Drain ou Better Stack
- Aucun PII (helper `logger.redactUser(user)` retourne `{ userIdHash }`)

**Métriques** :
- MVP : Render dashboard + `web-vitals` npm direct + POST endpoint noyau `/api/analytics/vitals` (zéro dépendance service tiers)
- Dette : OpenTelemetry + Grafana quand sous-projet 5 en prod

**Errors + tracing (Sentry free tier)** :
- Init host (`@sentry/nextjs`) + api (`@sentry/node`), 2 DSN distincts
- Contexte enrichi auto : `tenantId, userId, module, requestId` via ALS
- Sourcemaps upload en CI
- Sample tracing 20% prod
- Breadcrumbs enrichis par event bus
- `beforeSend` filter PII obligatoire :
  ```ts
  beforeSend: (event) => {
    if (event.user) event.user = { id: event.user.id };
    event.request?.cookies && (event.request.cookies = '[REDACTED]');
    event.request?.headers && delete event.request.headers.authorization;
    return event;
  }
  ```

**Correlation** : `requestId` UUID v7 propagé header HTTP + WS handshake + JWT payload + logs + Sentry.

### 6.3 CI/CD

**GitHub Actions** — 1 workflow `ci.yml`, 5 jobs orchestrés :

- Jobs : `quality` (lint + typecheck), `test-unit`, `test-integration` (service postgres:17), `test-e2e` (docker compose stack + Playwright), `security-audit` (`pnpm audit` bloque si high/critical)
- Dépendances : `test-unit` et `test-integration` needs `quality` ; `test-e2e` needs `test-unit` + `test-integration`
- Bloquant PR : `quality` + `test-unit` + `test-integration` + `security-audit`. E2E promu bloquant après 10 runs verts consécutifs.
- Workflows séparés (fichiers distincts) réservés à des besoins asynchrones futurs (nightly perf tests, release, dependabot auto-merge).

**Vercel** :
- Preview auto sur toute PR (host)
- Deploy prod sur push `main`
- Env vars via `vercel env pull`

**Render** :
- `render.yaml` racine : autoDeploy `main`, `predeploy: pnpm --filter @quetzal/db prisma migrate deploy`, `startCommand: node apps/api/dist/main.js`

**Git flow** :
- Branche `v2` = refonte
- Merge `v2 → main` quand noyau + module-hello E2E vert
- Ensuite trunk-based, features en branches courtes, PR obligatoire, squash merge

**Commits** : Conventional Commits (activation `caveman-commit` skill auto).

### 6.4 Sécurité

**Headers HTTP** (helmet Nest + next.config.ts headers) :
- HSTS, X-Content-Type-Options, X-Frame-Options DENY (SAMEORIGIN pour pages guest QR si intégration prévue), Referrer-Policy, Permissions-Policy
- CSP env-aware : `script-src 'self' 'nonce-<nonce>'; style-src 'self' 'unsafe-inline' (Radix/shadcn); connect-src 'self' ${API_URL} https://o<id>.ingest.sentry.io`
- Nonce dynamique par requête (Next 15 App Router support natif)

**Rate limiting** :
- Global (`@nestjs/throttler`) : 300 req/min per IP sur `/api/*` public
- Per-endpoint : override via `manifest.rateLimits.perEndpoint`
- Guest token endpoint : 100/h/IP
- WS : per-connection throttle event handlers
- MVP in-memory single-instance, Redis store à l'arrivée Redis

**Secrets** :
- Zéro secret en git. `.env` gitignoré (déjà là).
- Vercel `vercel env pull .env.local` (documenté README)
- Render dashboard settings
- Requis :
  - Communs : `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GUEST_TOKEN_SECRET`, `HOST_URL`, `API_URL`, `MODULES`
  - Host (Vercel) : `SENTRY_DSN_HOST`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_MODULES`
  - Api (Render) : `SENTRY_DSN_API`, `ALLOW_E2E_RESET` (dev/staging only)
  - Seed (dev/staging only, jamais prod) : `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`
- Rotation : JWKS auto Better-Auth, autres manuel documenté

**CSRF** :
- Better-Auth handle CSRF côté Next
- Nest = pas de CSRF (auth Bearer JWT, immune)

**Input validation** :
- **Zod partout** (schémas partagés host + api via `@quetzal/core/schemas/*`)
- ValidationPipe Nest global avec Zod adapter
- Sanitisation UGC (guest displayName, quiz text) : `sanitize-html` + escape natif React

**JWT storage client** : mémoire React uniquement (`useSession()`), refetch silencieux via `authClient.getToken()` avant expiration (setInterval sur `exp - 5min`). PAS localStorage (XSS), PAS cookie custom (Bearer header requis).

**Dependencies** :
- `pnpm audit` bloquant en CI si `high`+
- Dependabot activé, PR auto patch/minor
- SBOM `cyclonedx-npm` post-MVP

## 7. Testing strategy

### Pyramide + coverage

```
E2E Playwright         (~ 10-20 flows, ~ 5%)
Integration Vitest     (~ 100-200, ~ 20%)
+ testcontainers PG
Contract Suite         (~ 1 par module, blocking)
Unit Vitest            (~ 400-1000, ~ 75%)
```

**Coverage targets** :
- Domain ≥ 90% (règles métier zéro tolérance)
- Application ≥ 80%
- Infrastructure ≥ 60%
- Presentation : pas de seuil (E2E)
- Global ≥ 75%
- **Bloquant CI = régression > 5% par PR** (delta), pas absolu

### TDD discipline

- Red / Green / Refactor obligatoire
- Convention PR : commit history montre test avant implém (2 commits séparés `test:` puis `feat:`)
- Exception `hotfix-no-tdd` (label PR, dette taggée)
- **Enforcement systémique** : agent `correcteur-labs` invoqué à chaque jalon (fin sous-projet OU toutes 20-30 commits) audite compliance TDD, verdict GO/FIX/STOP

### Unit tests (Vitest)

- Fichier `*.spec.ts` colocalisé
- `describe` par classe, `it` par comportement (3e personne)
- Zéro mock dans domain layer
- Application layer : mock des ports via factories manuelles (pas `vi.mock`)
- Factories partagées `packages/core/src/testing/factories/`

### Integration tests (Vitest + testcontainers)

- `packages/core/src/testing/postgres-container.ts` : `PostgreSqlContainer('postgres:17').withReuse()`
- `resetTestDatabase()` = TRUNCATE CASCADE (rapide, UUID v7 pas de séquences)
- **Parallélisation** : `--pool=threads --poolOptions.threads.singleThread` sur dossiers integration seulement
- Docker Desktop requis local (fallback `SKIP_INTEGRATION=1`), CI = `services: postgres` natif

### Contract suite (livrable jour 1)

Cf section 3. v1 = Zod schema + naming + version + i18n parité + tenant-isolation + bypass attempt. v1.1 = introspection endpoints.

### E2E tests (Playwright)

- Scope MVP : 5-10 flows critiques
- Multi-client : contextes browser séparés (animateur + guests mobile viewport)
- **Déterminisme** : `page.waitForFunction(() => window.__lastEvent === 'pong')` plutôt que `waitForTimeout`
- **Test bridge** : `window.__quetzalTestBridge` en env `E2E=1` (guard strict, jamais exposé prod)
- **Reset endpoint** : `/api/e2e/reset` protégé par `X-E2E-Secret` header + refuse si `NODE_ENV=production` sans `ALLOW_E2E_RESET=true`
- `webServer` Playwright = `pnpm dev` + wait URL 200 (docker compose CI seul)
- `fullyParallel: false` MVP
- Reporting HTML + traces on failure

### WS resilience testing (obligatoire)

1. Reconnect avec même guest token → re-join room auto, pas de nouveau guestId
2. Expiration token en cours → serveur émet `token.expiring` 5min avant, refresh ou déco propre
3. Serveur restart (Render deploy) → exponential backoff, état récupéré DB + Redis (quand ajouté)
4. Multi-client synchro : 3 guests, broadcast, tous reçoivent en < 500ms, répété 20 fois

### Test data / seeders

`packages/core/src/testing/seed-helpers.ts` : `seedTenant`, `seedGuest`, `seedModule`. Factorise setup integration + E2E.

### Mocking strategy

**À mocker** : services externes (Sentry, OAuth futurs, SMTP) via `msw`. Clock via `vi.useFakeTimers()`.
**À ne PAS mocker** : DB (integration = vrai Postgres testcontainer), Prisma, event bus, Better-Auth.
**Interdit** : `vi.mock('module')` magic hoisting, snapshots gros objets. Snapshots OK petits DTO stables + `auth.prisma` généré (détecte drift).

### CI test matrix

| Job | Runtime | Bloque PR | Fréquence |
|---|---|---|---|
| lint + typecheck | ~30s | oui | chaque push |
| unit | ~1min | oui | chaque push |
| contract | ~30s | oui | chaque push |
| integration + PG | ~3min | oui | chaque push |
| e2e Playwright | ~5min | non→oui promoted | chaque push |
| security audit | ~10s | oui high+ | chaque push |

Cache Turborepo agressif (rerun packages impactés seulement).

## 8. Non-goals et roadmap

### 8.1 Non-goals sous-projet 1

| Domaine | Ce qu'on ne fait PAS |
|---|---|
| Modules métier | Aucun loto, quiz, neuro, SRS. `hello-world` stub uniquement. |
| Signup public | `allowUserToCreateOrganization: false`. Seed only. |
| Multi-tenant UI | Zéro switcher org, invitations, gestion membres. `default` unique. |
| Facturation | Aucune. |
| Panel super-admin | Aucun. Gestion via SQL direct + scripts. |
| SMS/téléphonie | Aucun Twilio. Guest = mobile web QR uniquement. |
| Analytics métier | Zéro dashboard usage. Web Vitals + logs seuls. |
| Notifications | Zéro email/push/WebPush. Toast in-app uniquement. |
| File upload | Aucun. |
| Cache Redis | Reporté sous-projet 2. MVP = Postgres + RAM. |
| Event bus distribué | EventEmitter2 in-process seul. |
| Hot-reload modules runtime | Modules chargés au boot via `MODULES=` env. |
| Rôles admin + super-admin | Vocabulaire posé, impl `owner + creator + learner + guest` seulement. |
| Motion/animations | shadcn transitions par défaut. `framer-motion` dette dès sous-projet 3 (quiz). |
| PWA/offline | Aucun service worker. Dette différenciante pour module-neuro futur. |
| A11y RGAA compliance | Radix/shadcn a11y par défaut, audit formel non requis MVP. Skills transférables post-23/10. |
| i18n content | Framework 3 langues, contenu FR + EN + ES tous remplis MVP. |
| Doc utilisateur | Doc dev + didactique privée. Pas de manuel utilisateur Elda. |
| Migration ancien code | Legacy jeté, Mongo Atlas coupé après refonte. |

### 8.2 Roadmap sous-projets suivants

**Chaque sous-projet aura son propre spec → plan → code cycle. Ce qui suit = intention, pas engagement date (garde-fou RGAA prioritaire jusqu'au 23/10).**

**Sous-projet 2 — Module Loto** (`packages/module-loto`) : animateur crée partie, guests QR, tirage WS, marquage carton, quine/carton plein, historique. Nouvelles dépendances : Redis (guest registry + état volatile + rate limit distribué + potentiel `bullmq` pour cadence tirages).

**Sous-projet 3 — Module Quiz Kahoot-like** (`packages/module-quiz`) : deck questions typologies variées, sessions live, scoring, podium. Nouvelles dépendances : Vercel Blob (images), potentiel `tiptap` (éditeur riche), `framer-motion` (feedback animation).

**Sous-projet 4 — Module Neurosciences/SRS** (`packages/module-neuro`) : deck cartes, algorithme spaced repetition, sessions review, analytics rétention, streaks, import Anki. **Choix algorithme (SM-2 vs FSRS) = panel expert obligatoire au démarrage** (`servo:expert-panel` ou `war-room`).

**Sous-projet 5 — Multi-tenant + billing** (`packages/tenancy` + Stripe Marketplace Vercel) : trigger = 1er client réel intéressé. Signup public, UI orgs/invitations/roles, plans + limites usage, panel super-admin. **Structure plans (freemium/per-seat/per-session) = panel expert**. Rework anticipé quasi nul côté data (tenant dormant depuis jour 1).

### 8.3 Décisions différées (avec triggers)

| Décision | Trigger |
|---|---|
| Redis Pub/Sub distribué | 2e instance Nest OU sous-projet 2 |
| Multi-schema Prisma | Couplage single-schema pénible (>3 modules conflits nommage) |
| Hot-reload modules runtime | Marketplace plugin clients tiers |
| OpenTelemetry + Grafana | Sous-projet 5 en prod, besoins tuning perf |
| RGPD workflow (export/deletion) | 1er client GDPR-scope |
| Migration Fly.io | p95 WS > 500ms régulier OU coût > 30€/mois OU downtime > 5min/mois |
| PWA/offline | Feedback utilisateur strong signal post sous-projets 2-3 |
| Décorateurs Nest permissions | Matrix devient pénible → contrat v1.1 |
| Endpoints introspection contract | Modules oublient couverture → contrat v1.1 |
| Storage adapter (`ctx.storage`) | Sous-projet 3 → contrat v1.1 |
| `module-share` (invitations lien, embed, export CSV/PDF) | Post sous-projet 3 |
| Domaine `quetzal.app` (achat + DNS) | Avant merge `v2 → main` OU garder `quetzal-theta.vercel.app` MVP |
| Motion `framer-motion` | Sous-projet 3 (feedback réponse quiz) |

### 8.4 Success criteria sous-projet 1

Le noyau est fini et prêt à recevoir un vrai module quand :

1. Elda se logue via `/login` → `/dashboard`
2. Sidebar affiche `Hello` module, badge activation vert
3. Clic `Hello` → page RSC, layout shell propre
4. Bouton "Greet" → réponse JSON, toast affiché
5. Bouton "Ping" → WS pong latence < 300ms
6. QR code affiché, scan mobile → page join, saisie pseudo, connexion WS guest
7. Animateur broadcast → guest reçoit message
8. Locale switcher fonctionne (FR/EN placeholder/ES placeholder), persiste en User.locale
9. Tous tests verts CI (unit + integration + contract + E2E flow ci-dessus)
10. Coverage domain ≥ 90%, application ≥ 80%
11. Aucun event Sentry `level: error` ou `fatal` en prod pendant 48h de tests répétés (warnings React DevTools tolérés)
12. Doc `docs/architecture.md`, `docs/module-contract.md`, `docs/didactique/` complets
13. CLAUDE.md conventions posé et suivi (vérifié par correcteur-labs)
14. Merge `v2 → main` fait, `quetzal.app` (ou preview URL nommée) en prod, ancien code supprimé
15. Zéro FIXME dans le noyau. TODO OK si taggés issue GitHub avec label.

## Addendum — Notes de durcissement et dettes assumées (v1.1)

Points capturés au fil des auto-critiques design, non intégrés au MVP v1.0 mais explicites.

### Sécurité et robustesse

- **CSP tightening styles** : `unsafe-inline` accepté MVP (Radix/shadcn). Nonce sur styles via Next 16 Cache Components à évaluer.
- **Rate limit WS per-connection** distinct du HTTP (throttle event handlers).
- **RGPD workflow** : data export/deletion routes, cookie banner post-commercialisation.
- **Endpoint `/api/e2e/reset`** : refus explicite `NODE_ENV=production` sans override `ALLOW_E2E_RESET=true` + header `X-E2E-Secret` obligatoire.
- **Anti-triche modules interactifs** : validation carton loto côté serveur, pas seulement client.

### Contrat module v1.1

- Décorateurs Nest `@ModulePermission()` remplacent `permissions` matrix manuelle (backward-compat)
- Endpoints introspection contract test (permissions couvrent 100% endpoints Nest)
- `ctx.storage?: StorageAdapter` (Vercel Blob, S3, local) pour modules nécessitant file upload
- `manifest.cspContributions?` pour modules qui chargent iframes/services tiers
- `configSchema: ZodSchema` validé à l'écriture `TenantModule.config`
- Test tenant-isolation auto-généré (parsing prismaModels + insertion 2 tenants)
- Types brand pour `RootPrismaClient` : `PrismaClient & { readonly __brand: 'root' }` + factory `createRootPrismaClient()` = seule voie légitime, `@prisma/client` PrismaClient direct banni côté modules par ESLint

### Data / Prisma

- Cache LRU clients scopés : max 1000 tenants, TTL 5min inactivité
- Lookup `modelHasTenantId` régénéré à chaque `pnpm install` + `pnpm prebuild`
- Raw SQL via helper `ctx.tenantRawQuery` (refuse sans clause `WHERE tenantId`)
- Test contract couvre `upsert`, `updateMany`, `deleteMany`, `groupBy`, `createMany`, nested includes
- Convention nested includes middleware $extends (à valider par test dédié)

### Observabilité

- OpenTelemetry Metrics + Grafana quand sous-projet 5 en prod
- Passage Redis Pub/Sub distribué à la 2e instance Nest
- Fake timers Vitest : injecter clock via DI dans code custom, éviter timers Node réels

### UX / plateforme

- Multi-rôle par membership (v2 si besoin réel) — v1 = 1 rôle par membership
- Nommage `guest` (auth) vs `player` (UI/i18n) : convention documentée CLAUDE.md
- Convention nommage compétences par capacité, pas par client (mémoire `feedback_nommage_competences`)

### Composants noyau à finir

- Package `@quetzal/core` : subpath exports (`./events/*`, `./schemas/*`, `./testing/*`)
- Compteur guest `maxConcurrentPerSession` : impl MVP compteur mémoire, Redis dès module-loto
- Analytics vitals endpoint : `/api/analytics/vitals` stockage minimal DB ou pino log

### Ops

- Rétention AuditLog : 6 mois minimum, purge auto dette
- Monitoring uptime tiers gratuit (UptimeRobot ou équivalent) pour Render free spin-down alerte
- SBOM `cyclonedx-npm` post-MVP si demandé
- README setup documente prérequis `vercel env pull` + Docker Desktop pour integration tests

## Références

- Mémoire Sylvain : `user_tdd_codecraft`, `user_priorites_roi`, `feedback_correcteur_labs`, `project_certif_rgaa`, `project_secu_financiere_foyer`
- Vercel skills : `vercel:knowledge-update`, `vercel:nextjs`, `vercel:vercel-functions`, `vercel:ai-sdk`, `vercel:shadcn`, `vercel:auth`
- Existant jeté : `smaurier/quetzal` commits pré-`v2` (main = `53b95f0 cors resolve`)
- Doc didactique privée à écrire : `private/quetzal-didactique/` (hub Synapse, 12 docs thématiques ton étudiant 1re année info)

## Historique du design

| Date | Événement |
|---|---|
| 2026-08-29 | Design initial via `superpowers:brainstorming`, 8 sections + amendements v2 sur sections 3/4/5, addendum durcissements |
