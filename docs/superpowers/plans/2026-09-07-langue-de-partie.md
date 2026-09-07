# La langue d'une partie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'enseignante d'imposer sa langue à tous les écrans invités d'une partie, attribut `lang` du document compris.

**Architecture:** La langue est résolue une fois à la création et gelée sur la partie. Le lien d'entrée la transporte (`&lang=`). Le middleware la valide et la pose en en-tête de requête. `i18n/request.ts` l'applique en tête de sa chaîne de priorité, ce qui fait suivre `<html lang>` **et** les chaînes traduites sans toucher à la mise en page racine.

**Tech Stack:** Prisma, NestJS, Next 15 App Router, next-intl, zod, vitest, Playwright.

**Spec :** `docs/superpowers/specs/2026-09-07-langue-de-partie-design.md` · **Issue** : #40

---

## Décisions prises en écrivant ce plan

**1. La langue vient du client, pas de la base.** La partie est créée par l'API NestJS, qui ne reçoit pas le cookie `NEXT_LOCALE` de l'enseignante. Lire `User.locale` en base donnerait sa langue *enregistrée*, qui peut différer de celle qu'elle a sous les yeux. L'écran de création est un composant client : il connaît sa langue par `useLocale()` et l'envoie dans le corps de la requête. C'est « ma langue » au sens où elle l'entend. La valeur reste validée côté serveur.

**2. Le middleware ne pose l'en-tête que sur `/j/`.** Sinon n'importe quelle URL de l'application accepterait `?lang=`, y compris le tableau de bord. Rien ne l'exige, et une portée large est une surface de surprise gratuite.

**3. `@quetzal/i18n` devient une dépendance de `module-loto`.** Le module doit valider contre `LOCALES`. Recopier cette liste chez lui créerait exactement la dérive que le test de parité surveille ailleurs.

---

## Structure des fichiers

**Créés :**

| Fichier | Responsabilité |
|---|---|
| `apps/host/src/lib/forced-locale.ts` | Nom de l'en-tête + validation d'une langue non fiable. Pur. |
| `apps/host/src/lib/forced-locale.spec.ts` | |
| `e2e/tests/langue-de-partie.e2e.spec.ts` | Attribut `lang` et chaînes, sur le HTML servi |
| migration Prisma | Colonne `guestLocale` |

**Modifiés :**

| Fichier | Changement |
|---|---|
| `packages/module-loto/prisma/models.prisma` | `guestLocale String? @db.VarChar(5)` |
| `packages/module-loto/package.json` | dépendance `@quetzal/i18n` |
| `packages/module-loto/src/domain/ports/game.repository.ts` | `guestLocale` dans `GameSettings` |
| `packages/module-loto/src/presentation/dto/loto.dto.ts` | validation du champ |
| `packages/module-loto/src/presentation/game.controller.ts` | passe le champ au cas d'usage |
| `packages/module-loto/src/infrastructure/prisma-game.repository.ts` | lit et écrit la colonne |
| `packages/module-loto/src/application/testing/fake-repositories.ts` | la doublure suit le port |
| `packages/module-loto/src/presentation/ui/decks-page.tsx` | case à cocher + `useLocale()` |
| `packages/module-loto/src/presentation/ui/animator-page.tsx` | `&lang=` sur le lien |
| `packages/module-loto/src/i18n/{fr,en,es}.json` | libellé de la case |
| `apps/host/src/middleware.ts` | valide `?lang=` sur `/j/`, pose l'en-tête |
| `apps/host/src/i18n/request.ts` | l'en-tête en tête de priorité |

---

### Task 1: La validation d'une langue non fiable

Le paramètre vient de l'URL : c'est une donnée d'attaquant. Recopiée telle quelle dans `<html lang>`, une chaîne arbitraire serait une injection d'attribut. Logique pure, TDD strict.

**Files:**
- Create: `apps/host/src/lib/forced-locale.ts`
- Test: `apps/host/src/lib/forced-locale.spec.ts`

- [ ] **Step 1: Écrire le test rouge**

```ts
import { describe, it, expect } from 'vitest';
import { FORCED_LOCALE_HEADER, readForcedLocale } from './forced-locale';

describe('readForcedLocale', () => {
  it('accepte les langues connues', () => {
    expect(readForcedLocale('es')).toBe('es');
    expect(readForcedLocale('fr')).toBe('fr');
    expect(readForcedLocale('en')).toBe('en');
  });

  it('rejette une langue inconnue plutôt que de la propager', () => {
    expect(readForcedLocale('de')).toBeNull();
    expect(readForcedLocale('')).toBeNull();
  });

  it("rejette l'absence de valeur", () => {
    expect(readForcedLocale(null)).toBeNull();
    expect(readForcedLocale(undefined)).toBeNull();
  });

  it("refuse ce qui s'échapperait de l'attribut lang", () => {
    // Cette valeur arrive de l'URL, donc d'un inconnu. Sans liste blanche
    // elle atterrirait dans <html lang="..."> et en sortirait.
    expect(readForcedLocale('fr" onload="alert(1)')).toBeNull();
    expect(readForcedLocale('"><script>')).toBeNull();
    expect(readForcedLocale('fr es')).toBeNull();
  });

  it("porte un nom d'en-tête stable, posé par le middleware et lu par i18n", () => {
    expect(FORCED_LOCALE_HEADER).toBe('x-forced-locale');
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `pnpm --filter quetzal-host test forced-locale`
Expected: FAIL, module introuvable. Rapporter le message réel.

- [ ] **Step 3: Commit du test rouge**

```bash
git add apps/host/src/lib/forced-locale.spec.ts
git commit -m "test(host): refuser toute langue forcée hors de la liste connue"
```

- [ ] **Step 4: Écrire l'implémentation**

```ts
import { LOCALES, type Locale } from '@quetzal/i18n';

export const FORCED_LOCALE_HEADER = 'x-forced-locale';

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

// La valeur vient du paramètre `lang` de l'URL d'entrée invité, donc d'une
// source non fiable. Liste blanche obligatoire : une chaîne arbitraire
// recopiée dans <html lang="…"> s'en échapperait.
export function readForcedLocale(value: string | null | undefined): Locale | null {
  if (typeof value !== 'string') return null;
  return isLocale(value) ? value : null;
}
```

- [ ] **Step 5: Lancer le test**

Run: `pnpm --filter quetzal-host test forced-locale`
Expected: PASS. Rapporter le nombre réel.

- [ ] **Step 6: Commit**

```bash
git add apps/host/src/lib/forced-locale.ts
git commit -m "feat(host): valider la langue forcée contre la liste connue"
```

---

### Task 2: Le middleware transporte la langue, et seulement sur `/j/`

Câblage (CLAUDE.md §5, exemption 1), couvert par les E2E de la tâche 8. Un seul commit `feat:`.

**Files:**
- Modify: `apps/host/src/middleware.ts`

- [ ] **Step 1: Modifier le middleware**

Ajouter l'import en tête :

```ts
import { FORCED_LOCALE_HEADER, readForcedLocale } from '@/lib/forced-locale';
```

Puis, juste après `requestHeaders.set('x-nonce', nonce);` :

```ts
  // Les composants serveur ne reçoivent pas les paramètres de requête d'une
  // mise en page : le middleware est le seul endroit qui voit l'URL complète
  // avant le rendu. Il transporte, il ne décide pas — la décision reste dans
  // i18n/request.ts.
  // Restreint à /j/ : sans ça, n'importe quelle URL de l'application
  // accepterait ?lang=, tableau de bord compris. Rien ne l'exige.
  if (request.nextUrl.pathname.startsWith('/j/')) {
    const forced = readForcedLocale(request.nextUrl.searchParams.get('lang'));
    if (forced !== null) requestHeaders.set(FORCED_LOCALE_HEADER, forced);
  }
```

- [ ] **Step 2: Vérifier**

Run: `pnpm --filter quetzal-host typecheck lint test`
Expected: PASS. Rapporter les nombres réels.

- [ ] **Step 3: Commit**

```bash
git add apps/host/src/middleware.ts
git commit -m "feat(host): transporter la langue d'une partie jusqu'au rendu"
```

---

### Task 3: La chaîne de priorité

C'est le point qui fait tout suivre : `layout.tsx` obtient sa langue par `getLocale()`, qui découle de ce fichier. Le traiter ici fait suivre `<html lang>` **et** les chaînes.

Configuration (CLAUDE.md §5, exemption 1), couvert par les E2E. Un seul commit `feat:`.

**Files:**
- Modify: `apps/host/src/i18n/request.ts`

- [ ] **Step 1: Modifier la résolution**

Ajouter l'import :

```ts
import { FORCED_LOCALE_HEADER, readForcedLocale } from '@/lib/forced-locale';
```

Dans le corps de `getRequestConfig`, remplacer le calcul de `locale` par :

```ts
  const requestHeaders = await headers();
  const acceptLang = requestHeaders.get('accept-language');
  const browserLocale = acceptLang?.split(',')[0]?.split('-')[0];
  // La langue d'une partie prime sur celle de l'utilisateur, qui prime sur
  // celle de l'appareil. C'est l'ordre voulu : l'enseignante décide de la
  // langue de SA partie, sinon chacun garde la sienne.
  const forced = readForcedLocale(requestHeaders.get(FORCED_LOCALE_HEADER));
  const locale: Locale =
    forced ??
    (isLocale(cookieLocale)
      ? cookieLocale
      : isLocale(browserLocale)
        ? browserLocale
        : DEFAULT_LOCALE);
```

L'appel existant `(await headers())` est remplacé par la variable `requestHeaders` : ne pas laisser deux appels.

- [ ] **Step 2: Vérifier**

Run: `pnpm --filter quetzal-host typecheck lint test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/host/src/i18n/request.ts
git commit -m "feat(host): faire primer la langue d'une partie sur celle de l'appareil"
```

---

### Task 4: La colonne et le port

Une interface TypeScript n'a pas de comportement à assertir (CLAUDE.md §5, amendement du 05/09) : le port et la migration arrivent sans test préalable, mais l'adaptateur de la tâche 5 est en TDD strict.

**Files:**
- Modify: `packages/module-loto/prisma/models.prisma`
- Modify: `packages/module-loto/package.json`
- Modify: `packages/module-loto/src/domain/ports/game.repository.ts`
- Create: une migration Prisma

- [ ] **Step 1: Ajouter la colonne**

Dans `packages/module-loto/prisma/models.prisma`, modèle `Loto_Game`, après `maxTeams` :

```prisma
  guestLocale            String?  @db.VarChar(5)
```

`packages/db/prisma/schema.prisma` est **généré** par `schema:merge` : ne pas l'éditer à la main.

- [ ] **Step 2: Étendre le port**

Dans `packages/module-loto/src/domain/ports/game.repository.ts` :

```ts
export interface GameSettings {
  pattern: PatternKey;
  falseClaimPenaltyDraws: number;
  maxTeams: number;
  /**
   * Langue imposée à tous les écrans invités, résolue UNE FOIS à la création
   * depuis celle de l'animatrice. `null` quand l'option est décochée : chaque
   * appareil garde alors la sienne. Jamais relue en direct — sinon une
   * animatrice changeant sa langue ferait basculer toute la classe.
   */
  guestLocale: string | null;
}
```

- [ ] **Step 3: Ajouter la dépendance**

Dans `packages/module-loto/package.json`, ajouter `"@quetzal/i18n": "workspace:*"` aux `dependencies`, puis `pnpm install`.

- [ ] **Step 4: Créer la migration contre un Postgres LOCAL**

⛔ **Jamais contre Neon.** `.env.local` pointe sur la base de production. Démarrer la base jetable et passer une `DATABASE_URL` locale explicite :

```bash
docker compose -f docker-compose.e2e.yml up -d
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
```

Relire cette variable avant d'appuyer, puis :

Run: `pnpm --filter @quetzal/db prisma:migrate:dev --name add_loto_game_guest_locale`
Expected: un dossier de migration contenant un seul `ALTER TABLE "Loto_Game" ADD COLUMN "guestLocale" VARCHAR(5);`. **Lire le SQL généré avant de continuer** — s'il contient autre chose, s'arrêter et le signaler.

- [ ] **Step 5: Réparer ce que le port casse**

Étendre `GameSettings` casse tout ce qui en construit un. Corriger la doublure `packages/module-loto/src/application/testing/fake-repositories.ts` et les fabriques de test, en passant `guestLocale: null`.

Run: `pnpm --filter @quetzal/module-loto typecheck`
Expected: PASS. Rapporter la liste des fichiers qu'il a fallu toucher.

- [ ] **Step 6: Commit**

```bash
git add packages/module-loto/prisma packages/module-loto/package.json packages/module-loto/src/domain/ports/game.repository.ts packages/module-loto/src/application/testing packages/db/prisma/migrations pnpm-lock.yaml
git commit -m "feat(loto): porter la langue d'une partie dans le modèle"
```

---

### Task 5: La persistance (TDD strict)

**Files:**
- Modify: `packages/module-loto/src/infrastructure/prisma-game.repository.ts`
- Test: le fichier de test d'intégration du dépôt (le repérer avec `ls packages/module-loto/src/infrastructure/`)

- [ ] **Step 1: Écrire le test rouge**

Ajouter au fichier de test d'intégration existant du dépôt, en suivant ses conventions de montage (testcontainers) :

```ts
  it('écrit et relit la langue imposée', async () => {
    const game = await repository.create({
      deckId: deck.id,
      createdBy: 'u-1',
      joinCode: 'LANG01',
      settings: { pattern: 'linea', falseClaimPenaltyDraws: 0, maxTeams: 6, guestLocale: 'es' },
    });
    const reread = await repository.findById(game.id);
    expect(reread?.settings.guestLocale).toBe('es');
  });

  it("laisse la langue à null quand l'option est décochée", async () => {
    // Le défaut, et le seul cas qui existe pour toutes les parties déjà en
    // base : la migration ajoute une colonne nullable, pas une valeur.
    const game = await repository.create({
      deckId: deck.id,
      createdBy: 'u-1',
      joinCode: 'LANG02',
      settings: { pattern: 'linea', falseClaimPenaltyDraws: 0, maxTeams: 6, guestLocale: null },
    });
    const reread = await repository.findById(game.id);
    expect(reread?.settings.guestLocale).toBeNull();
  });
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `pnpm --filter @quetzal/module-loto test:integration`
Expected: FAIL — la colonne n'est ni écrite ni relue. Rapporter le message réel.

- [ ] **Step 3: Commit du test rouge**

```bash
git add packages/module-loto/src/infrastructure
git commit -m "test(loto): exiger que la langue d'une partie survive à un aller-retour en base"
```

- [ ] **Step 4: Implémenter**

Dans `prisma-game.repository.ts`, ajouter `guestLocale` au `data` de la création et au mappage `settings` de la lecture, exactement comme `maxTeams` et `falseClaimPenaltyDraws` le sont déjà. Suivre le motif existant du fichier.

- [ ] **Step 5: Lancer**

Run: `pnpm --filter @quetzal/module-loto test:integration`
Expected: PASS. Rapporter le nombre réel.

- [ ] **Step 6: Commit**

```bash
git add packages/module-loto/src/infrastructure
git commit -m "feat(loto): persister la langue d'une partie"
```

---

### Task 6: La validation d'entrée (TDD strict)

**Files:**
- Modify: `packages/module-loto/src/presentation/dto/loto.dto.ts`
- Modify: `packages/module-loto/src/presentation/game.controller.ts`
- Test: le fichier de test du DTO (le repérer avec `ls packages/module-loto/src/presentation/dto/`)

- [ ] **Step 1: Écrire le test rouge**

Dans le fichier de test du DTO — le créer s'il n'existe pas, sous `loto.dto.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { createGameSchema } from './loto.dto.js';

const base = { deckId: 'd-1', pattern: 'linea', maxTeams: 6, falseClaimPenaltyDraws: 0 };

describe('createGameSchema, langue de partie', () => {
  it('accepte une langue connue', () => {
    expect(createGameSchema.safeParse({ ...base, guestLocale: 'es' }).success).toBe(true);
  });

  it("accepte l'absence de langue : l'option est décochée", () => {
    expect(createGameSchema.safeParse(base).success).toBe(true);
    expect(createGameSchema.safeParse({ ...base, guestLocale: null }).success).toBe(true);
  });

  it('refuse une langue inconnue', () => {
    // La validation ne peut pas vivre uniquement dans le middleware : celui-ci
    // protège l'affichage, pas ce qu'on écrit en base.
    expect(createGameSchema.safeParse({ ...base, guestLocale: 'de' }).success).toBe(false);
    expect(createGameSchema.safeParse({ ...base, guestLocale: '"><script>' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `pnpm --filter @quetzal/module-loto test loto.dto`
Expected: FAIL — le troisième cas passe alors qu'il devrait échouer, zod ignorant les clés inconnues. Rapporter le message réel.

- [ ] **Step 3: Commit du test rouge**

```bash
git add packages/module-loto/src/presentation/dto
git commit -m "test(loto): refuser une langue de partie inconnue à l'entrée"
```

- [ ] **Step 4: Implémenter**

Dans `loto.dto.ts`, ajouter l'import `import { LOCALES } from '@quetzal/i18n';` et, dans `createGameSchema` :

```ts
  guestLocale: z.enum(LOCALES).nullish(),
```

Puis, dans `game.controller.ts`, méthode `create`, ajouter au `settings` transmis :

```ts
        guestLocale: parsed.data.guestLocale ?? null,
```

- [ ] **Step 5: Lancer**

Run: `pnpm --filter @quetzal/module-loto test`
Expected: PASS. Rapporter le nombre réel.

- [ ] **Step 6: Commit**

```bash
git add packages/module-loto/src/presentation
git commit -m "feat(loto): accepter et normaliser la langue d'une partie"
```

---

### Task 7: Les deux écrans

Presentation : couverte par les E2E de la tâche 8. Un seul commit `feat:`.

**Files:**
- Modify: `packages/module-loto/src/presentation/ui/decks-page.tsx`
- Modify: `packages/module-loto/src/presentation/ui/animator-page.tsx`
- Modify: `packages/module-loto/src/i18n/{fr,en,es}.json`

- [ ] **Step 1: Les libellés, dans les trois catalogues du module**

Sous la clé des réglages de partie — repérer la structure exacte avec `cat packages/module-loto/src/i18n/fr.json` et suivre l'emplacement de `maxTeams` et `penalty` :

- fr : `"forceLocale": "Tous les participants voient la partie dans ma langue"`
- en : `"forceLocale": "Everyone sees the game in my language"`
- es : `"forceLocale": "Todos ven la partida en mi idioma"`

Les trois fichiers doivent garder une structure de clés identique.

- [ ] **Step 2: La case à cocher**

Dans `decks-page.tsx`, ajouter `useLocale` à l'import next-intl existant :

```tsx
import { useTranslations, useLocale } from 'next-intl';
```

Dans le composant, à côté des autres états :

```tsx
  const locale = useLocale();
  const [forceLocale, setForceLocale] = useState(false);
```

Dans `createGame`, ajouter au corps envoyé :

```tsx
        // La langue de l'animatrice telle qu'elle la voit MAINTENANT. L'API
        // ne reçoit pas son cookie, et sa langue enregistrée en base peut
        // différer de celle de son écran.
        guestLocale: forceLocale ? locale : null,
```

Dans le JSX, juste avant le `<Button ... data-testid="create-game">` :

```tsx
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={forceLocale}
              onChange={(event) => setForceLocale(event.target.checked)}
              data-testid="force-locale"
            />
            {tGame('forceLocale')}
          </label>
```

L'étiquette enveloppe la case : l'association est structurelle, sans `id` à tenir synchronisé. C'est ce que `getByLabel` sait lire, et c'est ce qui manquait aux cinq champs de la PR #35.

- [ ] **Step 3: Le lien d'entrée**

Dans `animator-page.tsx`, la construction du lien devient :

```tsx
  const joinUrl =
    snapshot === null || tenantId === undefined || tenantId === null
      ? null
      : `${origin}/j/loto/${snapshot.game.id}?tenantId=${tenantId}` +
        (snapshot.game.settings.guestLocale === null
          ? ''
          : `&lang=${snapshot.game.settings.guestLocale}`);
```

Adapter à la forme exacte du fichier — le lire avant de le modifier, la condition de garde existante ne doit pas changer.

**Le QR n'est pas concerné.** Il reste noir sur fond blanc opaque : un lecteur a besoin de ce contraste et de la zone de silence.

- [ ] **Step 4: Vérifier**

Run: `pnpm turbo run typecheck lint test`
Expected: PASS. Rapporter les nombres réels. Si `snapshot.game.settings.guestLocale` n'existe pas au typage, c'est que l'instantané ne transporte pas encore le champ : le signaler et remonter la chaîne jusqu'à `GameSnapshotUseCase`.

- [ ] **Step 5: Commit**

```bash
git add packages/module-loto/src/presentation/ui packages/module-loto/src/i18n
git commit -m "feat(loto): proposer d'imposer sa langue, et la porter dans le lien"
```

---

### Task 8: Les E2E, qui seuls prouvent l'attribut `lang`

C'est l'assertion qui couvre RGAA 8.3/8.4, et la seule qui distingue une vraie livraison d'une version qui traduit les chaînes en laissant le document mentir sur sa langue.

**Files:**
- Create: `e2e/tests/langue-de-partie.e2e.spec.ts`

- [ ] **Step 1: Écrire les tests**

```ts
import { test, expect } from '@playwright/test';

// Le navigateur annonce le français. Si la page invité rend de l'espagnol,
// c'est que la langue de la partie a primé — et l'attribut lang doit suivre,
// sans quoi un lecteur d'écran prononcerait l'espagnol à la française.
test.use({ locale: 'fr-FR' });

test("la page invité déclare la langue de la partie, pas celle de l'appareil", async ({ page }) => {
  const response = await page.goto('/j/loto/inexistante?tenantId=inexistant&lang=es');
  expect(await response!.text()).toMatch(/<html[^>]*lang="es"/);
});

test("sans langue de partie, l'appareil garde la sienne", async ({ page }) => {
  const response = await page.goto('/j/loto/inexistante?tenantId=inexistant');
  expect(await response!.text()).toMatch(/<html[^>]*lang="fr"/);
});

test('une langue inconnue est ignorée, pas recopiée', async ({ page }) => {
  const response = await page.goto('/j/loto/inexistante?tenantId=inexistant&lang=de');
  const html = await response!.text();
  expect(html).toMatch(/<html[^>]*lang="fr"/);
  expect(html).not.toContain('lang="de"');
});

test("le paramètre n'a aucun effet hors des pages invité", async ({ page }) => {
  // Restreindre la portée au segment /j/ évite qu'une URL partagée du
  // tableau de bord change la langue de qui la reçoit.
  const response = await page.goto('/login?lang=es');
  expect(await response!.text()).toMatch(/<html[^>]*lang="fr"/);
});
```

- [ ] **Step 2: Lancer les E2E**

⛔ **Ne jamais lancer `pnpm dev`** : il lit `.env.local`, qui pointe sur la base Neon de production et contient `ALLOW_E2E_RESET`. Procédure locale, ports décalés si 3000 est occupé :

```bash
docker compose -f docker-compose.e2e.yml up -d
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
export BETTER_AUTH_SECRET="e2e-local-secret-not-a-real-one-0123456789"
export GUEST_TOKEN_SECRET="e2e-local-guest-secret-0123456789"
export HOST_URL="http://localhost:3010" API_URL="http://localhost:3011"
export NEXT_PUBLIC_API_URL="http://localhost:3011" NEXT_PUBLIC_HOST_URL="http://localhost:3010"
export MODULES="hello,loto" NEXT_PUBLIC_MODULES="hello,loto"
export SEED_OWNER_EMAIL="elda@test.dev" SEED_OWNER_PASSWORD="TestPassword123!"
export E2E_HOST_URL="http://localhost:3010"
pnpm --filter @quetzal/db prisma:migrate:deploy && pnpm --filter @quetzal/db prisma:generate
pnpm build
pnpm --filter @quetzal/auth seed && pnpm --filter @quetzal/module-loto seed
```

Ne PAS exporter `NODE_ENV=production` : les scripts de semence refusent volontairement de tourner dans ce cas.

Le script `start` de l'hôte code le port 3000 en dur ; le contourner par `pnpm --filter quetzal-host exec next start -p 3010`. L'API accepte `PORT=3011`.

Run: `CI=1 pnpm exec playwright test e2e/tests/langue-de-partie.e2e.spec.ts --reporter=list`
Expected: `4 passed`.

`CI=1` neutralise le `webServer` de la configuration Playwright, qui sinon irait chercher le port 3000.

- [ ] **Step 3: Non-régression**

Run: `CI=1 pnpm exec playwright test --reporter=list`
Expected: tous les fichiers passent, **sans qu'aucun test existant n'ait été modifié**. L'option est décochée par défaut : si un test existant demande une retouche, c'est que le défaut a changé, et il faut comprendre pourquoi avant d'aller plus loin.

- [ ] **Step 4: Démonter et restaurer**

Arrêter les serveurs, `docker compose -f docker-compose.e2e.yml down -v`, et vérifier que `.env.local` est intact.

- [ ] **Step 5: Vérification complète**

Run: `pnpm turbo run lint typecheck test`
Expected: PASS. **Reporter le nombre réel de tests affiché, jamais le nombre attendu.**

- [ ] **Step 6: Commit et PR**

```bash
git add e2e/tests/langue-de-partie.e2e.spec.ts
git commit -m "test(e2e): prouver que le document déclare la langue de la partie"
git push -u origin feat/langue-de-partie
gh pr create --title "feat(loto): la langue d'une partie" --body "<résumé>"
```
