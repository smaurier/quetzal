# Enchaîner plusieurs figures dans une même partie, plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'animatrice de faire enchaîner plusieurs figures (`linea` puis `llena`) dans une même partie, sans recréer de partie ni faire rescanner les téléphones.

**Architecture:** La partie porte une liste ordonnée de figures et l'index de celle en cours. Une réclamation valide avance l'index, ou termine la partie si c'était la dernière. Tout continue d'une figure à l'autre : mêmes tablas, tirages accumulés, marquages conservés. Le statut reste `running` entre les figures, donc `GAME_STATUSES` et `canTransition` ne sont pas touchés.

**Tech Stack:** Prisma, NestJS, Socket.io, next-intl, zod, vitest, testcontainers, Playwright.

**Spec :** `docs/superpowers/specs/2026-11-04-enchainer-les-figures-design.md` · **Issue** : #30

---

## ⛔ Deux règles du dépôt que ce plan a d'abord violées

Corrigé le 04/11 après le refus de la relecture de qualité sur la tâche 1. **Ces deux règles
valent pour TOUTES les tâches de ce plan**, y compris celles dont le code d'exemple ne les
montrerait pas.

**1. Jamais `throw new Error(...)`** (`CLAUDE.md` §8 et §14). Le module a seize classes d'erreur
dans `packages/module-loto/src/domain/errors.ts` : suivre leur patron. Et la conséquence n'est pas
cosmétique : dans `apps/api/src/filters/global-exception.filter.ts`, un `Error` nu part en 500 avec
capture Sentry **et perd son message**, tandis qu'un `DomainError` rend 400 sans Sentry en
conservant le sien.

Pour les erreurs de ce chantier, le choix est tranché : une liste ou un index corrompus en base
**ne sont pas** des règles métier violées par la requête, donc les classes étendent `Error` et non
`DomainError`, pour garder le 500 et la capture. Ce choix doit être tenu par un test dans
`errors.spec.ts`, pas par un commentaire : ce fichier affirme que toutes ses classes descendent de
`DomainError`, et sans test rouge le prochain passage « corrigera » l'anomalie et éteindra Sentry.

**2. Jamais de `as` sans typeguard** (`CLAUDE.md` §8). Dans le code de production, typer
l'interface plutôt que caster son résultat. Les `as` des fichiers E2E sont tolérés : ils reprennent
le style déjà en place dans `loto-guest.e2e.spec.ts`.

---

## Décisions descendues de la spec, et une qui s'y ajoute

**1. La base stocke une chaîne, le port expose un tableau.** `patterns String @db.VarChar(64)` porte les clés séparées par une virgule (`"linea,llena"`). `GameSettings.patterns` est un `PatternKey[]`, et c'est le dépôt Prisma qui traduit dans les deux sens, comme il retype déjà `status` et `pattern`. `CLAUDE.md` §9 interdit les enums Postgres ; une liste de une à quatre clés courtes ne mérite pas un tableau Postgres. La borne `VarChar(64)` suit le style du fichier, où `pattern` était en `VarChar(16)`.

**2. ⭐ `advancePattern` est un compare-and-set, pas une incrémentation.** Trouvé en relisant la spec de façon critique : son garde-fou D5 traite la pénalité, pas le double avancement. Deux téléphones réclamant au même tirage lisent tous deux `patternIndex: 0`, sont tous deux valides, et appellent tous deux `advancePattern` : l'index sauterait de 2 et une figure serait sautée. Le code actuel n'avait pas ce défaut parce que `setStatus('finished')` deux fois donne le même résultat ; une incrémentation, non.

La signature est donc `advancePattern(gameId: string, depuisIndex: number): Promise<boolean>` : elle n'avance que si l'index vaut encore `depuisIndex`, et rend `false` sinon. Le `WHERE` porte la condition, donc Postgres arbitre, pas l'application.

**3. L'ordre de la migration est contraint.** Remplir avant de retirer, sinon on détruit la donnée qui sert à remplir. Détail en tâche 3.

---

## Structure des fichiers

**Créés :**

| Fichier | Responsabilité |
|---|---|
| `packages/module-loto/src/domain/pattern-list.ts` | Lire, écrire et valider une liste de figures. Pur. |
| `packages/module-loto/src/domain/pattern-list.spec.ts` | |
| `packages/core/src/events/loto.ts` | `LotoPatternWonEvent`. ⚠️ Le fichier **existe** et declare deja quatre evenements : mon plan disait le contraire (verifie le 05/11). |
| migration Prisma | cinq étapes, voir tâche 3 |
| `e2e/tests/enchainer-les-figures.e2e.spec.ts` | une partie à deux figures, menée jusqu'à la seconde |

**Modifiés :**

| Fichier | Changement |
|---|---|
| `packages/module-loto/prisma/models.prisma` | `Loto_Game` : `patterns`, `patternIndex`, retrait de `pattern` · `Loto_Claim` : `pattern` |
| `packages/module-loto/src/domain/ports/game.repository.ts` | `GameSettings.patterns`, `GameState.patternIndex`, `advancePattern`, `hasValidClaimAt`, `setWinner`, `recordClaim` |
| `packages/module-loto/src/infrastructure/prisma-game.repository.ts` | traduction chaîne vers tableau et retour, les trois nouvelles méthodes |
| `packages/module-loto/src/application/testing/fake-repositories.ts` | la doublure suit le port |
| `packages/module-loto/src/application/claim.use-case.ts` | avance ou termine, et ne pénalise pas au tirage d'une victoire |
| `packages/module-loto/src/application/game-snapshot.use-case.ts` | figure courante et progression |
| `packages/module-loto/src/presentation/dto/loto.dto.ts` | `patterns` au lieu de `pattern` |
| `packages/module-loto/src/presentation/game.controller.ts` | passe la liste |
| `packages/module-loto/src/presentation/loto.broadcaster.ts` | `pattern-changed` |
| `packages/module-loto/src/manifest.ts` | `loto.pattern.won` dans `eventsPublished` |
| `packages/module-loto/src/presentation/ui/decks-page.tsx` | choix des figures, dans l'ordre |
| `packages/module-loto/src/presentation/ui/animator-page.tsx` | la progression |
| `packages/module-loto/src/i18n/{fr,en,es}.json` | libellés de progression |

---

### Task 1: La liste de figures, logique pure

Lire une chaîne venue de la base, écrire une chaîne pour y aller, et refuser ce qui n'est pas une liste valide. TDD strict : c'est du domaine.

**Files:**
- Create: `packages/module-loto/src/domain/pattern-list.ts`
- Test: `packages/module-loto/src/domain/pattern-list.spec.ts`

- [ ] **Step 1: Écrire le test rouge**

```ts
import { describe, it, expect } from 'vitest';
import { parsePatternList, serializePatternList, isValidPatternList } from './pattern-list.js';

describe('parsePatternList', () => {
  it('lit une liste de la base', () => {
    expect(parsePatternList('linea,llena')).toEqual(['linea', 'llena']);
  });

  it('lit une liste à une seule figure, le cas de toutes les parties existantes', () => {
    expect(parsePatternList('linea')).toEqual(['linea']);
  });

  it('ignore les espaces autour des clés', () => {
    expect(parsePatternList(' linea , llena ')).toEqual(['linea', 'llena']);
  });

  it('rejette une clé inconnue plutôt que de la propager', () => {
    // La valeur vient de la base, donc d un écrit passé qui peut être
    // antérieur à une suppression de figure. Mieux vaut lever ici que rendre
    // une clé que `matchesPattern` ne saurait pas honorer.
    expect(() => parsePatternList('linea,inconnue')).toThrow();
    expect(() => parsePatternList('')).toThrow();
  });
});

describe('serializePatternList', () => {
  it('écrit une liste pour la base', () => {
    expect(serializePatternList(['linea', 'llena'])).toBe('linea,llena');
  });

  it('fait un aller-retour sans perte', () => {
    expect(parsePatternList(serializePatternList(['esquinas', 'centro', 'llena']))).toEqual([
      'esquinas',
      'centro',
      'llena',
    ]);
  });
});

describe('isValidPatternList', () => {
  it('accepte de une à quatre figures', () => {
    expect(isValidPatternList(['linea'])).toBe(true);
    expect(isValidPatternList(['linea', 'esquinas', 'centro', 'llena'])).toBe(true);
  });

  it('refuse une liste vide', () => {
    expect(isValidPatternList([])).toBe(false);
  });

  // Décision D8 : rejouer la même figure deux fois de suite n a pas de sens,
  // la seconde serait gagnée au tirage suivant par la même équipe.
  it('refuse un doublon', () => {
    expect(isValidPatternList(['linea', 'linea'])).toBe(false);
  });

  it('refuse une clé inconnue', () => {
    expect(isValidPatternList(['linea', 'inconnue'])).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `pnpm --filter @quetzal/module-loto test pattern-list`
Expected: FAIL, module introuvable. Rapporter le message réel.

- [ ] **Step 3: Commit du test rouge**

```bash
git add packages/module-loto/src/domain/pattern-list.spec.ts
git commit -m "test(loto): lire, ecrire et valider une liste de figures"
```

- [ ] **Step 4: Écrire l'implémentation**

```ts
import { PATTERN_KEYS, isPatternKey, type PatternKey } from './pattern.js';

/** Quatre figures existent : une liste n en contient ni zéro ni plus. */
const MAX = PATTERN_KEYS.length;

/**
 * La base stocke une chaîne (`CLAUDE.md` §9 : pas d enum Postgres, et un
 * tableau Postgres serait disproportionné pour quatre clés courtes). Le port
 * expose un tableau : la traduction vit ici, et nulle part ailleurs.
 */
export function parsePatternList(raw: string): PatternKey[] {
  const keys = raw.split(',').map((key) => key.trim());
  const list = keys.filter(isPatternKey);
  if (list.length !== keys.length || !isValidPatternList(list)) {
    // Pas un `Error` nu : §14. Voir l avertissement en tete de plan, et
    // `InvalidPatternListError` dans errors.ts, qui porte l operation
    // (lecture ou ecriture) et la raison fermee.
    throw new InvalidPatternListError('lecture', JSON.stringify(raw), patternListProblem(keys));
  }
  return list;
}

export function serializePatternList(list: readonly PatternKey[]): string {
  return list.join(',');
}

export function isValidPatternList(list: readonly string[]): boolean {
  if (list.length === 0 || list.length > MAX) return false;
  if (new Set(list).size !== list.length) return false;
  return list.every(isPatternKey);
}
```

- [ ] **Step 5: Vérifier qu'`isPatternKey` est bien exporté**

Run: `grep -n "export function isPatternKey" packages/module-loto/src/domain/pattern.ts`
Expected: une ligne. Si la fonction n'est pas exportée, l'exporter sans changer son corps, et le dire dans le message de commit.

- [ ] **Step 6: Lancer le test**

Run: `pnpm --filter @quetzal/module-loto test pattern-list`
Expected: PASS, 10 tests. Rapporter le nombre réel.

- [ ] **Step 7: Commit**

```bash
git add packages/module-loto/src/domain/pattern-list.ts packages/module-loto/src/domain/pattern.ts
git commit -m "feat(loto): la liste de figures, lue ecrite et validee"
```

---

### Task 2: L'avance d'index, logique pure

Le cœur de la fonctionnalité, et la seule règle qui décide si la partie continue ou s'arrête. TDD strict.

**Files:**
- Modify: `packages/module-loto/src/domain/pattern-list.ts`
- Test: `packages/module-loto/src/domain/pattern-list.spec.ts`

- [ ] **Step 1: Écrire le test rouge**

Ajouter au fichier de test :

```ts
import { patternAt, isLastPattern, patternProgress } from './pattern-list.js';

describe('patternAt', () => {
  it('rend la figure en cours', () => {
    expect(patternAt(['linea', 'llena'], 0)).toBe('linea');
    expect(patternAt(['linea', 'llena'], 1)).toBe('llena');
  });

  it('lève plutôt que de rendre undefined sur un index hors liste', () => {
    // `noUncheckedIndexedAccess` est actif : un accès nu rendrait
    // `PatternKey | undefined` et polluerait tous les appelants.
    expect(() => patternAt(['linea'], 1)).toThrow(PatternIndexOutOfRangeError);
    expect(() => patternAt(['linea'], -1)).toThrow(PatternIndexOutOfRangeError);
  });
});

describe('isLastPattern', () => {
  it('reconnaît la dernière figure : la partie se terminera', () => {
    expect(isLastPattern(['linea', 'llena'], 1)).toBe(true);
  });

  it('reconnaît une figure intermédiaire : la partie continuera', () => {
    expect(isLastPattern(['linea', 'llena'], 0)).toBe(false);
  });

  it('une liste à une figure est toujours à sa dernière', () => {
    expect(isLastPattern(['linea'], 0)).toBe(true);
  });
});

describe('patternProgress', () => {
  it('dit où on en est, pour l écran de l animatrice', () => {
    expect(patternProgress(['linea', 'esquinas', 'llena'], 1)).toEqual({
      current: 'esquinas',
      position: 2,
      total: 3,
    });
  });

  it('compte à partir de un, pas de zéro : c est lu par un humain', () => {
    expect(patternProgress(['linea'], 0).position).toBe(1);
  });
});
```

Et dans `packages/module-loto/src/domain/errors.ts`, à côté de `InvalidPatternListError`, sur le
même patron et avec la même justification de ne pas étendre `DomainError` :

```ts
export class PatternIndexOutOfRangeError extends Error {
  constructor(index: number, length: number) {
    super(`index de figure hors liste : ${index} sur ${length}`);
    this.name = this.constructor.name;
  }
}
```

⚠️ `this.constructor.name` et non le littéral : c'est le motif de `packages/core/src/errors.ts`, et
un littéral mentirait sous extension alors que le filtre global construit le code HTTP depuis
`exception.name`.

Et dans `errors.spec.ts`, le test qui tient la décision :

```ts
  it('ne descend PAS de DomainError, pour que le filtre la traite en panne', () => {
    expect(new PatternIndexOutOfRangeError(1, 1)).not.toBeInstanceOf(DomainError);
  });
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `pnpm --filter @quetzal/module-loto test pattern-list`
Expected: FAIL, `patternAt is not a function`. Rapporter le message réel.

- [ ] **Step 3: Commit du test rouge**

```bash
git add packages/module-loto/src/domain/pattern-list.spec.ts
git commit -m "test(loto): la figure en cours, la derniere, et la progression"
```

- [ ] **Step 4: Écrire l'implémentation**

Ajouter à `pattern-list.ts` :

```ts
export function patternAt(list: readonly PatternKey[], index: number): PatternKey {
  const key = list[index];
  if (key === undefined) {
    // Pas un `Error` nu : §14. Et pas un `DomainError` non plus, pour la même
    // raison qu `InvalidPatternListError` : un index hors liste veut dire une
    // ligne desynchronisee en base, donc une panne a regarder, pas une regle
    // metier violee par la requete.
    throw new PatternIndexOutOfRangeError(index, list.length);
  }
  return key;
}

export function isLastPattern(list: readonly PatternKey[], index: number): boolean {
  return index >= list.length - 1;
}

export interface PatternProgress {
  current: PatternKey;
  /** À partir de un : ce chiffre est lu par un humain. */
  position: number;
  total: number;
}

export function patternProgress(list: readonly PatternKey[], index: number): PatternProgress {
  return { current: patternAt(list, index), position: index + 1, total: list.length };
}
```

- [ ] **Step 5: Lancer**

Run: `pnpm --filter @quetzal/module-loto test pattern-list`
Expected: PASS. Rapporter le nombre réel.

- [ ] **Step 6: Commit**

```bash
git add packages/module-loto/src/domain/pattern-list.ts
git commit -m "feat(loto): la figure en cours, la derniere, et la progression"
```

---

### Task 3: La migration, dans l'ordre imposé

⛔ **Le piège de cette tâche est connu et documenté** : une colonne `NOT NULL` sans valeur par défaut fait échouer le déploiement sur les lignes existantes. C'est le bug `account.issuer` du 04/11, qui a laissé l'API 25 heures en arrière et cassé l'inscription en production.

**Files:**
- Modify: `packages/module-loto/prisma/models.prisma`
- Create: une migration Prisma

- [ ] **Step 1: Modifier le modèle**

Dans `Loto_Game`, remplacer `pattern String @db.VarChar(16)` par :

```prisma
  patterns               String   @db.VarChar(64)
  patternIndex           Int      @default(0)
```

Dans `Loto_Claim`, après `atDraw` :

```prisma
  pattern    String   @db.VarChar(16)
```

`packages/db/prisma/schema.prisma` est **généré** par `schema:merge` : ne pas l'éditer à la main.

- [ ] **Step 2: Démarrer une base LOCALE et contrôler la variable**

⛔ **Jamais contre Neon.** `.env.local` pointe sur la production.

```bash
docker compose -f docker-compose.e2e.yml up -d
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "ARRET"; exit 1;; *localhost:5432*) echo "ok local";; esac
pnpm --filter @quetzal/db schema:merge && pnpm --filter @quetzal/db prisma:migrate:deploy
```

Expected: `All migrations have been successfully applied.`

- [ ] **Step 3: Poser des données AVANT migration, pour prouver le remplissage**

```bash
docker exec quetzal-postgres-1 psql -U test -d quetzal_test -c "SELECT count(*) FROM \"Loto_Game\";"
```

Expected: un nombre. S'il vaut zéro, la semence n'a pas tourné : lancer `pnpm --filter @quetzal/module-loto seed` puis créer une partie et une réclamation à la main avant de continuer, sinon l'étape 6 ne prouvera rien.

- [ ] **Step 4: Écrire la migration à la main**

`prisma migrate dev` est interactif et refuse de tourner ici (constaté le 04/11). Créer le dossier et le fichier :

```bash
mkdir -p packages/db/prisma/migrations/20261104120000_loto_enchainer_les_figures
```

`migration.sql` :

```sql
-- L'ordre est contraint : remplir AVANT de retirer, sinon on detruit la
-- donnee qui sert a remplir. Et aucune colonne NOT NULL sans defaut posee
-- d'un coup : c'est le bug account.issuer du 04/11, qui a laisse l'API 25 h
-- en arriere et casse l'inscription en production.

-- 1. la figure d'une reclamation, d'abord nullable
ALTER TABLE "Loto_Claim" ADD COLUMN "pattern" VARCHAR(16);

-- 2. remplie depuis la figure de sa partie, tant qu'elle existe encore
UPDATE "Loto_Claim" c
   SET "pattern" = g."pattern"
  FROM "Loto_Game" g
 WHERE c."gameId" = g."id" AND c."tenantId" = g."tenantId";

-- 3. et seulement maintenant, exigee
ALTER TABLE "Loto_Claim" ALTER COLUMN "pattern" SET NOT NULL;

-- 4. la liste et l'index de la partie, la liste remplie depuis la figure unique
ALTER TABLE "Loto_Game" ADD COLUMN "patterns" VARCHAR(64);
ALTER TABLE "Loto_Game" ADD COLUMN "patternIndex" INTEGER NOT NULL DEFAULT 0;
UPDATE "Loto_Game" SET "patterns" = "pattern";
ALTER TABLE "Loto_Game" ALTER COLUMN "patterns" SET NOT NULL;

-- 5. la figure unique NE disparait PAS ici, et c'est delibere. Voir ci-dessous.

-- 6. les deux CHECK, la liste comme la figure unique
ALTER TABLE "Loto_Claim" ADD CONSTRAINT "Loto_Claim_pattern_check"
  CHECK ("pattern" IN ('linea', 'esquinas', 'centro', 'llena'));
ALTER TABLE "Loto_Game" ADD CONSTRAINT "Loto_Game_patterns_check"
  CHECK ("patterns" ~ '^(linea|esquinas|centro|llena)(,(linea|esquinas|centro|llena)){0,3}$');
```

⚠️ **Deux corrections du 04/11, après relecture de qualité. Elles changent le sens de la tâche.**

**1. Les deux CHECK ci-dessus manquaient.** La migration d'origine du module
(`20260904063920_add_module_loto/migration.sql`, lignes 183-191) posait quatre contraintes sur
`Loto_Game`, dont `CHECK ("pattern" IN (...))`. Les retirer sans les remplacer perdait une garantie
au niveau base, ce que `CLAUDE.md` §9 interdit. Mon premier contrôle était mauvais : j'avais cherché
`@@index` et `@@unique` dans le modèle Prisma, où les CHECK n'apparaissent pas. Elles se lisent dans
le SQL ou dans `pg_constraint`.

**2. `patterns` reste nullable et `pattern` reste en place.** Motif *expand / contract*. La base est
migrée pendant que l'ancienne instance sert encore le trafic, et il faut une concession par
direction :

| direction | ce que l'ancien code fait | la concession |
|---|---|---|
| lecture | lit `Loto_Game.pattern` | `pattern` reste, et reste `NOT NULL` |
| écriture | crée des parties sans `patterns` | `patterns` reste **nullable** |

Sans la seconde, une création de partie par l'ancienne instance échouerait sur une colonne `NOT NULL`
sans défaut. Sans la première, `isPatternKey(undefined)` serait faux et `toState` lèverait sur
**toute** lecture de partie. Le second temps est tracé dans l'**issue #52**.

- [ ] **Step 5: Comparer avec ce que Prisma attend**

Run: `cd packages/db && pnpm exec prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`
Expected: le SQL que Prisma produirait. Il ne contiendra PAS les `UPDATE` : c'est normal, Prisma ne devine pas un remplissage. Vérifier que les `ALTER` correspondent aux miens, à l'ordre près. S'il propose autre chose, s'arrêter et le signaler.

- [ ] **Step 6: Appliquer et prouver le remplissage**

```bash
pnpm --filter @quetzal/db prisma:migrate:deploy
docker exec quetzal-postgres-1 psql -U test -d quetzal_test \
  -c 'SELECT count(*) AS sans_figure FROM "Loto_Claim" WHERE "pattern" IS NULL;' \
  -c 'SELECT "patterns", "patternIndex" FROM "Loto_Game" LIMIT 3;'
```

Expected: `sans_figure` à zéro, et `patterns` rempli d'une seule clé. Rapporter les valeurs réelles.

- [x] **Step 7: Constater que le typecheck est VERT, et comprendre pourquoi c'est un problème**

⚠️ **Cette étape disait d'abord l'inverse. Mesuré le 04/11, elle avait tort, et la raison compte.**

`pnpm --filter @quetzal/module-loto typecheck` sort à **0, zéro erreur**, alors que `Loto_Game.pattern`
vient de disparaître et que sept sites de `prisma-game.repository.ts` la lisent encore. Vérifié :
le fichier est bien dans le programme `tsc` (`--listFiles`), et le client Prisma régénéré est bien à
jour (`patterns`/`patternIndex` sur la partie, `pattern` sur la réclamation).

**La cause est un double cast, ligne 84** : `getTenantScopedPrisma() as unknown as PrismaWithLoto`.
Or `getTenantScopedPrisma()` rend déjà un `PrismaClient` complet et entièrement typé
(`TenantScopedPrismaClient = ReturnType<typeof createTenantScopedClient>`, qui rend `PrismaClient`).
Le cast ne comble donc aucun manque : il **remplace** un type exact par `PrismaWithLoto`, écrit à la
main, qui type chaque `where` et chaque `data` en `Record<string, unknown>`. Aucun nom de colonne
n'est vérifié nulle part dans la persistance du module.

Prouvé par une sonde jetable : sans le cast, `tsc` rend
`error TS2561: 'pattern' does not exist in type 'Loto_GameWhereInput'. Did you mean to write 'patterns'?`

**Le vrai signal rouge est ailleurs, et il existe** : `pnpm --filter @quetzal/module-loto
test:integration` tombe à **16 échecs sur 33**, avec `Argument 'patterns' is missing` — une erreur
Prisma à l'exécution. C'est le seul filet de cette couche, et il tient.

**Conséquence pour la suite : les tâches 4 à 11 ne peuvent pas s'appuyer sur `tsc` pour la
persistance.** Leur preuve est l'intégration, jamais la compilation.
- [ ] **Step 8: Commit**

```bash
git add packages/module-loto/prisma/models.prisma packages/db/prisma/migrations
git commit -m "feat(loto): la liste de figures en base, remplie avant retrait"
```

---

### Task 4: Le port

Une interface TypeScript n'a pas de comportement à assertir (`CLAUDE.md` §5, amendement du 05/09) : elle arrive sans test préalable, mais son adaptateur est en TDD strict à la tâche 5.

**Files:**
- Modify: `packages/module-loto/src/domain/ports/game.repository.ts`

- [ ] **Step 1: Étendre `GameSettings` et `GameState`**

Dans `GameSettings`, remplacer `pattern: PatternKey;` par :

```ts
  /**
   * Les figures à enchaîner, dans l ordre voulu par l animatrice. De une à
   * quatre, sans doublon. Une liste à une entrée est le cas de toutes les
   * parties créées avant cette fonctionnalité.
   */
  patterns: PatternKey[];
```

Dans `GameState`, après `lastDrawOrder` :

```ts
  /** Où en est la partie dans sa liste de figures. Zéro à la création. */
  patternIndex: number;
```

- [ ] **Step 2: Ajouter les deux méthodes**

```ts
  /**
   * Avance d une figure, et seulement si l index vaut encore `depuisIndex`.
   * Rend `false` quand quelqu un a avancé entre-temps.
   *
   * ⭐ Compare-and-set et NON incrémentation : deux téléphones réclamant au
   * même tirage lisent tous deux le même index, sont tous deux valides, et
   * appelleraient tous deux cette méthode. Un `++` ferait sauter une figure.
   * La condition vit dans le `WHERE`, donc Postgres arbitre, pas nous.
   */
  advancePattern(gameId: string, depuisIndex: number): Promise<boolean>;

  /**
   * Vrai si une réclamation valide est déjà enregistrée à ce tirage. Sert le
   * garde-fou D5 : au tirage où une figure vient d être gagnée, une
   * réclamation ratée ne bloque personne : elle avait raison une seconde trop
   * tard, et la punir mécaniquement serait injuste.
   */
  hasValidClaimAt(gameId: string, atDraw: number): Promise<boolean>;

  /**
   * Écrit la gagnante sans toucher au statut. `setStatus` ne peut pas servir
   * ici : `ALLOWED.running` vaut `['finished']`, donc la transition
   * `running → running` est refusée, et à raison : le statut ne change pas,
   * il n a donc rien à faire dans ce geste.
   */
  setWinner(gameId: string, teamId: string): Promise<void>;
```

- [ ] **Step 3: Étendre `recordClaim`**

```ts
  recordClaim(input: {
    gameId: string;
    teamId: string;
    atDraw: number;
    valid: boolean;
    pattern: PatternKey;
  }): Promise<void>;
```

- [ ] **Step 4: Réparer ce que le port casse**

Étendre le port casse tout ce qui construit un `GameSettings` ou un `GameState`. **Neuf** specs de `src/application/` partagent la constante `SETTINGS` : y remplacer `pattern: 'linea'` par `patterns: ['linea']`, et la typer `GameSettings` plutôt qu'en `as const`, sinon le tableau devient un tuple `readonly` incompatible avec `PatternKey[]`. Quatre cas d'usage (`claim`, `draw-card`, `finish-game`, `game-snapshot`) lisent aussi `game.settings.pattern` hors de tout objet de réglages : les traduire en `patternAt(game.settings.patterns, game.patternIndex)`. La doublure `fake-repositories.ts` reçoit `patternIndex: 0` à la création, plus les **trois** nouvelles méthodes, et son `list()` recalcule la figure courante de la même façon :

```ts
  async advancePattern(gameId: string, depuisIndex: number): Promise<boolean> {
    const game = this.games.get(gameId);
    if (game === undefined || game.patternIndex !== depuisIndex) return false;
    this.games.set(gameId, { ...game, patternIndex: depuisIndex + 1 });
    return true;
  }

  async setWinner(gameId: string, teamId: string): Promise<void> {
    const game = this.games.get(gameId);
    if (game !== undefined) this.games.set(gameId, { ...game, wonByTeamId: teamId });
  }

  async hasValidClaimAt(gameId: string, atDraw: number): Promise<boolean> {
    return this.claims.some(
      (claim) => claim.gameId === gameId && claim.atDraw === atDraw && claim.valid,
    );
  }
```

⚠️ La doublure de `recordClaim` doit aussi mémoriser `pattern`, sinon `hasValidClaimAt` tiendra mais les tests de la tâche 6 ne pourront pas vérifier la figure enregistrée.

Run: `pnpm --filter @quetzal/module-loto typecheck`

Expected: **ÉCHEC, confiné à `prisma-game.repository.ts`.** Corrigé le 04/11 : cette étape attendait
d'abord un PASS, ce qui était impossible. Changer le port fait disparaître `GameSettings.pattern`,
donc la ligne `pattern: input.settings.pattern` de l'adaptateur ne compile plus, et `toState` doit
désormais rendre un `patternIndex` qu'il ne produit pas. Ces deux corrections sont le cœur de la
tâche 5 et s'y font en TDD strict : les faire ici court-circuiterait le test rouge.

Noter que c'est le SEUL endroit où `tsc` mord sur cette couche, et seulement parce que les types
viennent du port. Tout ce qui passe par le client Prisma reste invisible au compilateur jusqu'au
retrait du double cast en tâche 5 (voir tâche 3, étape 7).

⛔ **Ne touche pas à l'adaptateur.** Rapporte la liste exacte des erreurs, et vérifie qu'elles sont
toutes dans ce fichier : une erreur ailleurs voudrait dire que le port a cassé autre chose, et il
faut alors le dire.

Rapporter aussi la liste des fichiers qu'il a fallu toucher.

- [ ] **Step 5: Commit**

```bash
git add packages/module-loto/src/domain/ports packages/module-loto/src/application/testing packages/module-loto/src
git commit -m "feat(loto): le port porte la liste, l index et le compare-and-set"
```

---

### Task 5: La persistance (TDD strict)

⚠️ **Cette tâche a été réécrite le 04/11 après mesure. Elle disait deux choses incompatibles** :
son en-tête demandait de supprimer `GameRow`, `TeamRow` et `PrismaWithLoto`, et son étape 4
demandait de les modifier. Elle nommait aussi l'interface `LotoPrisma`, alors qu'elle s'appelle
`PrismaWithLoto`.

Le retrait du double cast est donc sorti d'ici : **c'est la tâche 5b**, un refactor pur, protégé par
la suite d'intégration que cette tâche-ci rend verte. Mesuré le 04/11 : retirer le cast produit onze
erreurs nouvelles, quatorze en tout dans l'adaptateur. Mêler ça à un changement de comportement en
TDD aurait rendu impossible de dire laquelle des deux moitiés casse quoi.

**Ce qui reste ici, en plus du changement de persistance :**

**1. La double écriture et le repli de lecture** (motif *expand / contract*, tâche 3, issue #52).
Tant que `Loto_Game.pattern` existe et que `patterns` est nullable :

- **à l'écriture**, renseigner les deux : `patterns` sérialisée, et `pattern` égale à la première
  entrée de la liste, pour que l'ancienne instance sache encore lire les parties que la nouvelle
  crée. Prendre cette entrée avec `patternAt(patterns, 0)`, jamais `patterns[0]` :
  `noUncheckedIndexedAccess` rendrait `PatternKey | undefined`.
- **à la lecture**, `row.patterns` est `string | null` : il vaut NULL sur une ligne écrite par
  l'ancien code. Replier sur `row.pattern`, et ne jamais laisser un NULL atteindre
  `parsePatternList`. Cette règle vit dans une fonction pure et testée (étape 0), pas en ligne dans
  l'adaptateur : c'est la seule façon de la couvrir sans insérer une ligne NULL à la main en base.

**2. Un seul `throw new Error` à remplacer, pas deux.** `toState` en a deux et le §14 les interdit,
mais celui sur la figure disparaît tout seul : après migration la figure n'est plus lue en direct,
elle sort de `parsePatternList`, qui lève déjà `InvalidPatternListError('lecture', brut, probleme)`.
Reste celui du statut, qui demande une classe neuve.

Elle étend `Error` et **non** `DomainError`, comme `InvalidPatternListError` et
`PatternIndexOutOfRangeError` posées à la tâche 2, et pour la même raison : un statut corrompu en
base n'est pas une règle métier violée par la requête, c'est une donnée cassée qui doit faire 500 et
partir dans Sentry. ⚠️ `errors.spec.ts` affirme que toutes ses classes descendent de `DomainError` :
ce choix doit être tenu par un test dans ce fichier, sinon le prochain passage « corrigera »
l'anomalie et éteindra Sentry.

```ts
export class UnknownGameStatusError extends Error {
  constructor(raw: string) {
    super(`statut de partie inconnu en base : ${raw}`);
    this.name = this.constructor.name;
  }
}
```

**Files:**
- Modify: `packages/module-loto/src/infrastructure/prisma-game.repository.ts`
- Test: `packages/module-loto/src/infrastructure/prisma-game.repository.integration.spec.ts`
- Modify: `packages/module-loto/src/presentation/dto/loto.dto.ts` *(remonté de la tâche 10)*
- Modify: `packages/module-loto/src/presentation/game.controller.ts` *(remonté de la tâche 10)*
- Test: `packages/module-loto/src/presentation/loto.gateway.integration.spec.ts` *(une doublure à
  réparer, ligne 89 : un littéral `settings: { pattern: 'linea', ... }`)*

- [ ] **Step 0: La règle de lecture, pure et testée d'abord**

Dans `packages/module-loto/src/domain/pattern-list.ts`, ajouter :

```ts
/**
 * Lit la liste d une ligne de partie pendant la bascule expand / contract
 * (issue #52). `patterns` vaut NULL sur une ligne ecrite par l ancien code,
 * qui ne connaissait que la figure unique : on replie dessus.
 */
export function patternsDeLaLigne(patterns: string | null, pattern: string): readonly PatternKey[] {
  return parsePatternList(patterns ?? pattern);
}
```

Le test, dans `pattern-list.spec.ts`, AVANT l'implémentation :

```ts
  describe('patternsDeLaLigne', () => {
    it('lit la liste quand la colonne est remplie', () => {
      expect(patternsDeLaLigne('linea,llena', 'linea')).toEqual(['linea', 'llena']);
    });

    it('replie sur la figure unique quand la liste est NULL', () => {
      // Une partie creee par l ancienne instance pendant la bascule.
      expect(patternsDeLaLigne(null, 'llena')).toEqual(['llena']);
    });

    it('leve si les deux colonnes sont inexploitables', () => {
      expect(() => patternsDeLaLigne(null, 'inexistante')).toThrow(InvalidPatternListError);
    });
  });
```

Run: `pnpm --filter @quetzal/module-loto test` → les trois doivent être ROUGES d'abord. Commits
séparés : `test(loto):` puis `feat(loto):`.

- [ ] **Step 1: Écrire le test rouge**

Ajouter au fichier d'intégration existant, en suivant ses conventions (`aGame()`, `inTenant()`) :

```ts
  it('ecrit et relit une liste de figures', async () => {
    const { tenantId, ownerId, decks, games } = await aGame();
    const deck = await inTenant(tenantId, ownerId, () =>
      decks.create({ name: 'Jeu figures', isTemplate: false, createdBy: ownerId, cards: [...TRADITIONAL_CARDS] }),
    );

    const game = await inTenant(tenantId, ownerId, () =>
      games.create({
        deckId: deck.id,
        createdBy: ownerId,
        joinCode: 'FIG001',
        settings: { patterns: ['linea', 'llena'], falseClaimPenaltyDraws: 0, maxTeams: 6, guestLocale: null },
      }),
    );

    const reread = await inTenant(tenantId, ownerId, () => games.findById(game.id));
    expect(reread?.settings.patterns).toEqual(['linea', 'llena']);
    expect(reread?.patternIndex).toBe(0);
  });

  it('avance l index une seule fois quand deux appels partent du meme', async () => {
    // Le defaut que le compare-and-set ferme : deux telephones reclamant au
    // meme tirage liraient tous deux l index 0. Un `++` ferait sauter une
    // figure. Ici le second appel doit rendre false et ne rien changer.
    const { tenantId, ownerId, decks, games } = await aGame();
    const deck = await inTenant(tenantId, ownerId, () =>
      decks.create({ name: 'Jeu course', isTemplate: false, createdBy: ownerId, cards: [...TRADITIONAL_CARDS] }),
    );
    const game = await inTenant(tenantId, ownerId, () =>
      games.create({
        deckId: deck.id,
        createdBy: ownerId,
        joinCode: 'FIG002',
        settings: { patterns: ['linea', 'llena'], falseClaimPenaltyDraws: 0, maxTeams: 6, guestLocale: null },
      }),
    );

    const premier = await inTenant(tenantId, ownerId, () => games.advancePattern(game.id, 0));
    const second = await inTenant(tenantId, ownerId, () => games.advancePattern(game.id, 0));

    expect(premier).toBe(true);
    expect(second).toBe(false);
    expect((await inTenant(tenantId, ownerId, () => games.findById(game.id)))?.patternIndex).toBe(1);
  });

  it('enregistre la figure d une reclamation, et la retrouve au meme tirage', async () => {
    const { tenantId, ownerId, games, game } = await aGame();
    const teams = await inTenant(tenantId, ownerId, () => games.teams(game.id));
    const team = teams[0];
    expect(team).toBeDefined();
    if (team === undefined) return;

    await inTenant(tenantId, ownerId, () =>
      games.recordClaim({ gameId: game.id, teamId: team.id, atDraw: 7, valid: true, pattern: 'linea' }),
    );

    expect(await inTenant(tenantId, ownerId, () => games.hasValidClaimAt(game.id, 7))).toBe(true);
    expect(await inTenant(tenantId, ownerId, () => games.hasValidClaimAt(game.id, 8))).toBe(false);
  });
```

⚠️ Si `aGame()` ne crée pas d'équipe, le troisième test n'a pas de `teamId` : créer l'équipe avec la méthode que le fichier utilise déjà pour ses autres tests, sans inventer de helper.

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `pnpm --filter @quetzal/module-loto test:integration`
Expected: FAIL. Rapporter le message réel.

- [ ] **Step 3: Commit du test rouge**

```bash
git add packages/module-loto/src/infrastructure
git commit -m "test(loto): la liste en base, et le compare-and-set de l index"
```

- [ ] **Step 4: Implémenter**

Dans `GameRow`, **garder** `pattern: string;` (la bascule s'appuie dessus) et ajouter
`patterns: string | null;` et `patternIndex: number;`. Dans l'interface `PrismaWithLoto` — c'est son
vrai nom, le plan disait `LotoPrisma` à tort — `loto_Game` gagne `updateMany` s'il ne l'a pas déjà,
et `loto_Claim` gagne `count`.

Dans `toState`, le garde du statut devient une erreur typée, et la figure unique cesse d'être lue
directement :

```ts
    if (!isGameStatus(row.status)) {
      throw new UnknownGameStatusError(row.status);
    }
```

Le second `throw new Error`, celui sur `isPatternKey(row.pattern)`, **disparaît** : il est remplacé
par la lecture de la liste, qui porte déjà sa propre erreur typée.

```ts
        patterns: [...patternsDeLaLigne(row.patterns, row.pattern)],
```

et au niveau de l'état, `patternIndex: row.patternIndex`.

⚠️ Le spread est nécessaire : `patternsDeLaLigne` rend un `readonly PatternKey[]` et
`GameSettings.patterns` est passé `readonly` à la tâche 4 — vérifier lequel des deux le typecheck
exige, et ne pas ajouter de spread si les deux sont déjà `readonly`.

Dans `create`, écrire **les deux colonnes**, c'est la double écriture de la bascule :

```ts
        patterns: serializePatternList(input.settings.patterns),
        // Issue #52 : l ancienne instance lit encore cette colonne pendant
        // la bascule. Retiree au deploiement suivant.
        pattern: patternAt(input.settings.patterns, 0),
```

Les deux nouvelles méthodes :

```ts
  async advancePattern(gameId: string, depuisIndex: number): Promise<boolean> {
    // La condition est dans le WHERE : c est Postgres qui arbitre la course,
    // pas nous. `updateMany` rend le nombre de lignes touchées.
    // ⚠️ Pas de `as` ici (§8) : si `PrismaWithLoto` ne declare pas encore
    // `updateMany` sur `loto_Game`, l y ajouter en le typant
    // `Promise<{ count: number }>`, jamais `Promise<unknown>` suivi d un cast.
    // Cette interface disparait entierement a la tache 5b.
    const result = await this.prisma.loto_Game.updateMany({
      where: { id: gameId, patternIndex: depuisIndex },
      data: { patternIndex: depuisIndex + 1 },
    });
    return result.count === 1;
  }

  async hasValidClaimAt(gameId: string, atDraw: number): Promise<boolean> {
    return (await this.prisma.loto_Claim.count({ where: { gameId, atDraw, valid: true } })) > 0;
  }

  async setWinner(gameId: string, teamId: string): Promise<void> {
    await this.prisma.loto_Game.updateMany({ where: { id: gameId }, data: { wonByTeamId: teamId } });
  }
```

Et `recordClaim` écrit `pattern: input.pattern`.

- [ ] **Step 5: Lancer**

Run: `pnpm --filter @quetzal/module-loto test:integration`
Expected: PASS. Rapporter le nombre réel.

- [ ] **Step 6: Commit**

```bash
git add packages/module-loto/src/infrastructure
git commit -m "feat(loto): persister la liste, l index et la figure d une reclamation"
```


- [ ] **Step R1 (remonté de la tâche 10) : la validation d'entrée**

Dans `createGameSchema` de `loto.dto.ts`, remplacer `pattern: z.enum(PATTERN_KEYS),` par :

```ts
  // De une à quatre, sans doublon : `isValidPatternList` porte la règle, le
  // schéma ne fait que l appeler pour ne pas la dire deux fois.
  patterns: z
    .array(z.enum(PATTERN_KEYS))
    .refine(isValidPatternList, { message: 'liste de figures invalide' }),
```

- [ ] **Step R2 (remonté de la tâche 10) : le contrôleur passe la liste**

Dans `game.controller.ts`, remplacer `pattern: parsed.data.pattern,` par `patterns: parsed.data.patterns,`.

⚠️ **Pourquoi ces deux étapes ont changé de tâche.** Mesuré le 04/11 à la fin de la tâche 4 : le
typecheck rendait dix erreurs dans quatre fichiers, et deux d'entre elles n'étaient pas dans
l'adaptateur — `game.controller.ts(44,9)` et `loto.gateway.integration.spec.ts(89,19)`. Les laisser
à la tâche 10 aurait gardé l'arbre rouge pendant sept tâches, donc privé les tâches 6 à 9 du seul
garde automatique dont elles disposent. La tâche 10 garde les libellés et les deux écrans.

- [ ] **Step R3 : commit des deux étapes remontées**

Un commit séparé de celui de l'étape 6 : il porte la couche présentation, pas la persistance.

```bash
git add packages/module-loto/src/presentation
git commit -m "feat(loto): l entree accepte une liste de figures"
```

- [ ] **Step R4 : l'arbre redevient vert, et c'est la vraie fin de cette tâche**

Run: `pnpm --filter @quetzal/module-loto typecheck`
Expected: **PASS, zéro erreur.** C'est le premier vert depuis la tâche 3. S'il reste une erreur,
elle est à corriger ici, pas à reporter.

Run: `pnpm --filter @quetzal/module-loto test:integration`
Expected: **tout vert.** Cette suite était à 16 échecs sur 33 depuis la tâche 3 ; c'est elle, et non
le typecheck, qui a tenu le filet sur cette couche pendant tout ce temps.

---

### Task 5b: Retirer le double cast (refactor pur)

Sortie de la tâche 5 le 04/11, après mesure. **Aucun changement de comportement** : la suite
d'intégration verte de la tâche 5 est le filet, et elle doit rester verte à l'identique.

**Le défaut.** `prisma-game.repository.ts` ligne 84 fait
`getTenantScopedPrisma() as unknown as PrismaWithLoto`. Or `getTenantScopedPrisma()` rend déjà un
`PrismaClient` complet et entièrement typé : `TenantScopedPrismaClient` vaut
`ReturnType<typeof createTenantScopedClient>`, et cette fonction rend `PrismaClient`. Le cast ne
comble donc aucun manque, il **remplace** un type exact par un stub écrit à la main où chaque
`where` et chaque `data` est un `Record<string, unknown>`. Résultat mesuré à la tâche 3 : aucun nom
de colonne n'est vérifié nulle part dans la persistance du module, et `tsc` est resté vert alors que
sept sites lisaient une colonne supprimée.

**Files:**
- Modify: `packages/module-loto/src/infrastructure/prisma-game.repository.ts`

- [ ] **Step 1: Retirer le cast et les types écrits à la main**

Supprimer les interfaces `GameRow`, `TeamRow` et `PrismaWithLoto`, et écrire :

```ts
  private get prisma() {
    return getTenantScopedPrisma();
  }
```

La règle ESLint `packages/config/eslint/module.js` n'interdit que la *valeur* `PrismaClient`
(`importNames: ['PrismaClient']`) : rien n'est importé ici, le type vient de la valeur de retour.
Pour les types de lignes, utiliser ceux que le client expose, jamais un type réécrit.

- [ ] **Step 2: Lancer le typecheck et lire ce qu'il dit**

Run: `pnpm --filter @quetzal/module-loto typecheck`

Expected: **onze erreurs nouvelles, quatorze en tout dans ce fichier.** Mesuré le 04/11 en retirant
le seul cast, types écrits à la main laissés en place. Elles ne sont pas du bruit, elles disent où le
code mentait. Les trois familles observées :

| erreur | ce qu'elle révèle |
|---|---|
| `GameRow` n'accepte pas la vraie ligne (lignes 148, 154, 160) | le type écrit à la main ne correspond pas au schéma |
| `createMany` refuse `{ id, gameId, rank, label, imageId }[]` (ligne 192) | la forme attendue par Prisma est plus précise |
| `createTeam` refuse `cardIds: string[]`, `markedCardIds: never[]` (ligne 227) | un tableau JSON ne se passe pas comme un tableau nu |

⛔ **Ne pas faire taire une erreur par un `as`** : ce serait reproduire exactement le défaut qu'on
retire. Le §8 l'interdit, et chaque erreur a une vraie correction.

- [ ] **Step 3: Corriger jusqu'à zéro**

Run: `pnpm --filter @quetzal/module-loto typecheck` → **PASS, zéro erreur.**

- [ ] **Step 4: Prouver qu'aucun comportement n'a bougé**

Run: `pnpm --filter @quetzal/module-loto test:integration`

Expected: **exactement le même compte qu'à la fin de la tâche 5**, au test près. C'est tout ce que ce
refactor doit prouver. Un test qui change de verdict signifie que le comportement a bougé, donc que
ce n'est plus un refactor : s'arrêter et le dire.

- [ ] **Step 5: Vérifier que le compilateur mord enfin**

La preuve que ce refactor sert à quelque chose, et elle prend une commande. Renommer temporairement
`patterns` en `patternsX` dans un `where` de l'adaptateur, lancer le typecheck, constater l'erreur,
puis remettre. Avant ce refactor, cette mutation passait au vert.

Rapporter la sortie réelle des deux états.

- [ ] **Step 6: Commit**

```bash
git add packages/module-loto/src/infrastructure
git commit -m "refactor(loto): le depot consomme le client Prisma type"
```

---

### Task 6: La réclamation avance ou termine (TDD strict)

Le cœur. C'est la logique la plus porteuse du module : elle décide des victoires et des pénalités. Une erreur ici ne se voit pas en relisant le code, elle se voit en classe.

⚠️ **Deux defauts bloquants trouves en relecture le 05/11, tous deux venus de ce plan.**

**1. Le code que ce plan dictait jetait le resultat du compare-and-set.** Il appelait
`advancePattern` sans lire son booleen, puis `setWinner` et l'emission quoi qu'il arrive. En course,
l'equipe qui PERD le compare-and-set s'inscrivait gagnante et un second `loto.pattern.won` partait
pour une figure gagnee une seule fois. Ironie : ce plan consacre trois paragraphes a l'importance de
ce retour, et son propre code l'ignorait.

**2. Plus grave, et sur le chemin principal : la passerelle annoncait la fin de partie.**
`loto.gateway.ts` faisait `if (result.valid) await this.broadcaster.gameFinished(...)`, et le client
met `status: 'finished'` en dur. Donc gagner la `linea` dans une partie a deux figures annoncait a
tous les ecrans que la partie etait terminee. Aucune concurrence requise.

**Cause racine commune** : `ClaimResult` ne disait pas ce qui s'etait passe. `{ valid, atDraw,
blockedUntilDraw }` ne distingue pas « figure gagnee » de « partie terminee » — et la tache 9 de ce
plan demandait pourtant a l'appelant de faire cette distinction, avec une information que rien ne
lui donnait.

**Corrige** : `ClaimResult` porte desormais un `outcome` a quatre valeurs.

```ts
export type ClaimOutcome =
  | 'rejected'
  | 'pattern-won'
  | 'pattern-won-by-other'
  | 'game-finished';
```

`pattern-won-by-other` n'etait pas prevu : c'est l'equipe authentiquement gagnante qui arrive une
seconde trop tard. Sa reclamation est enregistree, elle n'est pas penalisee, elle n'est simplement
pas la gagnante de cette figure. Meme equite que la decision D5.

La doublure a gagne `failNextAdvancePattern`, sur le modele de `failNextAppendDraw` qui existait
deja, pour qu'un test puisse forcer une course perdue. Et `loto.gateway.spec.ts` (unitaire, pas
integration) garde la condition de diffusion : construire la passerelle a la main avec deux
doublures suffit, la ou un test d'integration aurait demande de restructurer tout un montage.

**Les deux corrections sont prouvees par mutation** : remettre l'un ou l'autre defaut fait rougir
1 et 2 tests respectivement. Avant, les deux passaient au vert.
**Files:**
- Modify: `packages/module-loto/src/application/claim.use-case.ts`
- Test: `packages/module-loto/src/application/claim.use-case.spec.ts`

- [ ] **Step 1: Écrire le test rouge**

Ajouter au fichier de test existant. `SETTINGS` y porte désormais `patterns: ['linea']` : ces tests définissent leurs propres réglages.

```ts
  const DEUX = { patterns: ['linea', 'llena'], falseClaimPenaltyDraws: 3, maxTeams: 6, guestLocale: null } as const;

  it('une figure intermediaire gagnee avance l index et laisse la partie courir', async () => {
    const { games, useCase, game, team } = await buildGagnant({ ...DEUX });

    const result = await useCase.execute({ gameId: game.id, teamId: team.id });

    expect(result.valid).toBe(true);
    const apres = await games.findById(game.id);
    expect(apres?.patternIndex).toBe(1);
    expect(apres?.status).toBe('running');
    expect(apres?.wonByTeamId).toBe(team.id);
  });

  it('la derniere figure gagnee termine la partie', async () => {
    const { games, useCase, game, team } = await buildGagnant({
      patterns: ['linea'],
      falseClaimPenaltyDraws: 3,
      maxTeams: 6,
      guestLocale: null,
    });

    await useCase.execute({ gameId: game.id, teamId: team.id });

    const apres = await games.findById(game.id);
    expect(apres?.status).toBe('finished');
    expect(apres?.patternIndex).toBe(0);
  });

  // Decision D5. Deux equipes qui crient ensemble est la situation normale en
  // classe : la seconde ne gagne pas, mais la punir serait injuste.
  it('au tirage d une victoire, une reclamation ratee ne bloque personne', async () => {
    const { games, useCase, game, team, autre } = await buildDeuxEquipes({ ...DEUX });
    await useCase.execute({ gameId: game.id, teamId: team.id });

    const result = await useCase.execute({ gameId: game.id, teamId: autre.id });

    expect(result.valid).toBe(false);
    expect(result.blockedUntilDraw).toBe(0);
    const equipes = await games.teams(game.id);
    expect(equipes.find((e) => e.id === autre.id)?.blockedUntilDraw).toBe(0);
  });

  it('hors tirage de victoire, une reclamation ratee bloque toujours', async () => {
    const { useCase, game, autre } = await buildDeuxEquipes({ ...DEUX });

    const result = await useCase.execute({ gameId: game.id, teamId: autre.id });

    expect(result.valid).toBe(false);
    expect(result.blockedUntilDraw).toBeGreaterThan(0);
  });

  it('juge la reclamation contre la figure EN COURS, pas la premiere', async () => {
    const { games, useCase, game, team } = await buildGagnant({ ...DEUX });
    await games.advancePattern(game.id, 0);

    const result = await useCase.execute({ gameId: game.id, teamId: team.id });

    // La tabla gagne la linea, pas la llena : apres avance, la meme
    // reclamation doit echouer.
    expect(result.valid).toBe(false);
  });
```

⚠️ `buildGagnant` et `buildDeuxEquipes` n'existent pas. Les écrire dans ce fichier, au-dessus des tests, sur le modèle du montage déjà présent : lire le haut du fichier et réutiliser sa façon de créer une partie, de geler des cartes, de créer une équipe et de poser des tirages. `buildGagnant` rend une équipe dont la tabla gagne la `linea` et pas la `llena` ; `buildDeuxEquipes` ajoute une seconde équipe qui ne gagne rien.

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `pnpm --filter @quetzal/module-loto test claim.use-case`
Expected: FAIL. Rapporter le message réel.

- [ ] **Step 3: Commit du test rouge**

```bash
git add packages/module-loto/src/application/claim.use-case.spec.ts
git commit -m "test(loto): avancer ou terminer, et ne pas punir au tirage d une victoire"
```

- [ ] **Step 4: Implémenter**

Dans `claim.use-case.ts`, remplacer le jugement et la branche `valid` :

```ts
    const patterns = game.settings.patterns;
    const pattern = patternAt(patterns, game.patternIndex);

    const valid = isWinningClaim({
      tablaCardIds: team.cardIds,
      drawnCardIds: drawn,
      pattern,
    });

    await this.games.recordClaim({
      gameId: game.id,
      teamId: team.id,
      atDraw: game.lastDrawOrder,
      valid,
      pattern,
    });

    if (valid) {
      if (isLastPattern(patterns, game.patternIndex)) {
        await this.games.setStatus(game.id, 'finished', { wonByTeamId: team.id });
        await this.eventBus.emit('loto.game.finished', {
          gameId: game.id,
          wonByTeamId: team.id,
          pattern,
          drawCount: game.lastDrawOrder,
        });
      } else {
        // Compare-and-set : si quelqu un a avancé entre-temps, on n avance pas
        // deux fois. La victoire reste enregistrée, elle, par recordClaim.
        await this.games.advancePattern(game.id, game.patternIndex);
        await this.games.setWinner(game.id, team.id);
        await this.eventBus.emit('loto.pattern.won', {
          gameId: game.id,
          wonByTeamId: team.id,
          pattern,
          drawCount: game.lastDrawOrder,
        });
      }
      return { valid: true, atDraw: game.lastDrawOrder, blockedUntilDraw: team.blockedUntilDraw };
    }

    // Décision D5 : au tirage où une figure vient d être gagnée, une
    // réclamation ratée ne coûte rien. L équipe avait raison une seconde trop
    // tard, et la pénalité est mécanique, donc invisible et inannulable.
    if (await this.games.hasValidClaimAt(game.id, game.lastDrawOrder)) {
      return { valid: false, atDraw: game.lastDrawOrder, blockedUntilDraw: team.blockedUntilDraw };
    }
```

Le reste de la branche `invalid` est inchangé.

⚠️ **Pourquoi `setWinner` et non `setStatus`** : `ALLOWED.running` vaut `['finished']`, donc la transition `running → running` est refusée, et à raison. Le statut ne change pas entre deux figures, il n'a donc rien à faire dans ce geste. La méthode est déjà posée en tâche 4 et implémentée en tâche 5.

- [ ] **Step 5: Lancer**

Run: `pnpm --filter @quetzal/module-loto test claim.use-case`
Expected: PASS. Rapporter le nombre réel.

- [ ] **Step 6: Lancer tout le module, le jugement touche beaucoup**

Run: `pnpm --filter @quetzal/module-loto test`
Expected: PASS. Rapporter le nombre réel.

- [ ] **Step 7: Commit**

```bash
git add packages/module-loto/src
git commit -m "feat(loto): la reclamation avance la figure ou termine la partie"
```

---

### Task 7: L'événement de domaine

`loto.pattern.won` est un contrat public inter-module : il se déclare au manifeste et son type vit dans `@quetzal/core/events`, jamais chez le module (`CLAUDE.md` §3).

⚠️ **Mesure du 05/11 : les types d'evenements de ce module ne sont pas tenus.** Les quatre
interfaces de `packages/core/src/events/loto.ts` declarent toutes un `tenantId`, et **aucune
emission reelle ne l'envoie**. Cause : `emit<T = unknown>(name: EventName, payload: T)` laisse `T`
libre et `EventName` est un gabarit, donc n'importe quel nom avec n'importe quelle charge compile.
Ces interfaces sont decoratives. Tracé dans l'**issue #53**.

Conséquence pour cette tâche : déclarer `LotoPatternWonEvent` avec **les champs réellement émis**,
sans `tenantId`, et ne pas entériner la divergence en recopiant le `tenantId` des quatre autres.
Le tenant est déjà porté par le contexte d'exécution et par le scope Prisma.
**Files:**
- Create or modify: `packages/core/src/events/loto.ts`
- Modify: `packages/module-loto/src/manifest.ts`

- [ ] **Step 1: Repérer où vivent les types d'événements existants**

Run: `grep -rn "LotoGameFinishedEvent" packages/core/src/ packages/module-loto/src/ | head -5`
Expected: le fichier qui les déclare. **S'il n'existe pas**, les quatre événements du manifeste n'ont pas de type : le créer avec les cinq, en suivant le nommage `<ModulePascalCase><EventPascalCase>Event` de `CLAUDE.md` §7, et le dire dans le message de commit.

- [ ] **Step 2: Déclarer le type**

```ts
export interface LotoPatternWonEvent {
  gameId: string;
  wonByTeamId: string;
  pattern: string;
  drawCount: number;
}
```

- [ ] **Step 3: Déclarer l'événement au manifeste**

Dans `eventsPublished`, après `loto.claim.rejected` :

```ts
    { name: 'loto.pattern.won', typeRef: 'LotoPatternWonEvent' },
```

- [ ] **Step 4: Vérifier**

Run: `pnpm --filter @quetzal/module-loto test manifest && pnpm turbo run typecheck`
Expected: PASS. La suite de contrat du module vérifie le manifeste : si elle exige qu'un `typeRef` corresponde à un type réel, elle le dira.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/events packages/module-loto/src/manifest.ts
git commit -m "feat(loto): publier loto.pattern.won au manifeste"
```

---

### Task 8: L'instantané porte la progression (TDD strict)

**Files:**
- Modify: `packages/module-loto/src/application/game-snapshot.use-case.ts`
- Test: `packages/module-loto/src/application/game-snapshot.use-case.spec.ts`

- [ ] **Step 1: Écrire le test rouge**

```ts
  it('transporte la figure en cours et la progression', async () => {
    const { games, useCase } = await build();
    const game = await games.create({
      deckId: 'deck-1',
      createdBy: 'u-1',
      joinCode: 'FIG003',
      settings: { patterns: ['linea', 'llena'], falseClaimPenaltyDraws: 3, maxTeams: 6, guestLocale: null },
    });
    await games.freezeCards(game.id, [{ rank: 1, label: 'Carta 1', imageId: null }]);
    await games.advancePattern(game.id, 0);

    const snapshot = await useCase.execute({ gameId: game.id });

    expect(snapshot.game.pattern).toBe('llena');
    expect(snapshot.game.patternPosition).toBe(2);
    expect(snapshot.game.patternTotal).toBe(2);
  });
```

`SnapshotGame` **aplatit** les réglages : `maxTeams` et `falseClaimPenaltyDraws` y sont à la racine, il n'y a pas d'objet `settings`. On suit ce motif, d'où `patternPosition` et `patternTotal` plutôt qu'un objet imbriqué.

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `pnpm --filter @quetzal/module-loto test game-snapshot`
Expected: FAIL. Rapporter le message réel.

- [ ] **Step 3: Commit du test rouge**

```bash
git add packages/module-loto/src/application/game-snapshot.use-case.spec.ts
git commit -m "test(loto): l instantane porte la figure en cours et la progression"
```

- [ ] **Step 4: Implémenter**

Dans `SnapshotGame`, `pattern: PatternKey;` reste (c'est la figure **en cours**) et deux champs arrivent :

```ts
  /** À partir de un : ce chiffre est lu par un humain. */
  patternPosition: number;
  patternTotal: number;
```

Dans le mappage :

```ts
        pattern: progress.current,
        patternPosition: progress.position,
        patternTotal: progress.total,
```

avec `const progress = patternProgress(game.settings.patterns, game.patternIndex);` au-dessus.

- [ ] **Step 5: Lancer**

Run: `pnpm --filter @quetzal/module-loto test`
Expected: PASS. Rapporter le nombre réel.

- [ ] **Step 6: Commit**

```bash
git add packages/module-loto/src/application/game-snapshot.use-case.ts
git commit -m "feat(loto): l instantane porte la figure en cours et la progression"
```

---

### Task 9: La diffusion

Câblage (`CLAUDE.md` §5, exemption 1), couvert par l'E2E de la tâche 11. Un seul commit `feat:`.

**Files:**
- Modify: `packages/module-loto/src/presentation/loto.broadcaster.ts`
- Modify: `packages/module-loto/src/presentation/game.controller.ts` (si c'est lui qui appelle le diffuseur après une réclamation)

- [ ] **Step 1: Repérer qui diffuse après une réclamation**

Run: `grep -rn "claimResult\|gameChanged" packages/module-loto/src/presentation/ | grep -v spec`
Expected: l'appelant. Le diffuseur ne s'appelle pas lui-même.

- [ ] **Step 2: Ajouter la diffusion**

Dans `loto.broadcaster.ts`, sur le modèle des six autres méthodes et en passant par le `emit()` existant :

⚠️ **Corrige le 05/11 : ce bloc appelait `this.emit(...)`, une methode partagee qui n'existe pas sur
cette branche.** Elle est introduite par la PR #49, encore ouverte. Le diffuseur actuel emet
directement, et c'est cette forme qu'il faut suivre :

```ts
  async patternChanged(gameId: string): Promise<void> {
    const snapshot = await this.snapshot.execute({ gameId });
    this.server?.to(this.room(gameId)).emit('pattern-changed', {
      pattern: snapshot.game.pattern,
      position: snapshot.game.patternPosition,
      total: snapshot.game.patternTotal,
    });
  }
```

Si la PR #49 est fusionnee avant celle-ci, le rebase remplacera cette forme par `this.emit(...)` :
c'est un conflit attendu et trivial, pas une erreur.

Puis l'appeler dans `loto.gateway.ts`, **sur `result.outcome === 'pattern-won'` et rien d'autre**.

⚠️ **Ce passage disait d'abord « quand la reclamation etait valide et que la partie n'est pas
terminee », sans dire comment l'appelant l'apprend : rien ne le lui disait.** `ClaimResult.outcome`,
ajoute en tache 6, le dit maintenant. Ne diffuse pas sur `pattern-won-by-other` : la figure a bien
change, mais c'est l'equipe gagnante qui l'a deja diffusee, et un second envoi ferait clignoter
l'ecran.

La condition de `gameFinished` est deja corrigee en tache 6 et gardee par `loto.gateway.spec.ts` :
ne la retouche pas.

- [ ] **Step 3: Vérifier**

Run: `pnpm --filter @quetzal/module-loto typecheck && pnpm --filter @quetzal/module-loto test`
Expected: PASS. Rapporter les nombres réels.

- [ ] **Step 4: Commit**

```bash
git add packages/module-loto/src/presentation
git commit -m "feat(loto): diffuser le changement de figure"
```

---

### Task 10: Les deux écrans

Presentation : couverte par l'E2E de la tâche 11. Un seul commit `feat:`.

**Files:**
- ~~`dto/loto.dto.ts`~~ et ~~`game.controller.ts`~~ : **faits en tâche 5**, étapes R1 et R2. Ils y ont
  été remontés pour que l'arbre ne reste pas rouge sept tâches de suite.
- Modify: `packages/module-loto/src/presentation/ui/decks-page.tsx`
- Modify: `packages/module-loto/src/presentation/ui/animator-page.tsx`
- Modify: `packages/module-loto/src/i18n/{fr,en,es}.json`

- [x] **Steps 1 et 2 : faits en tâche 5** (étapes R1 et R2). Le schéma d'entrée et le contrôleur.

- [ ] **Step 3: Les libellés, dans les trois catalogues**

Sous `module.loto.game`, juste après `maxTeams`, pour garder le même ordre de clés dans les trois fichiers :

- fr : `"patterns": "Figures à enchaîner"` et `"patternProgress": "Figure {position} sur {total} : {pattern}"`
- en : `"patterns": "Patterns to chain"` et `"patternProgress": "Pattern {position} of {total}: {pattern}"`
- es : `"patterns": "Figuras a encadenar"` et `"patternProgress": "Figura {position} de {total}: {pattern}"`

- [ ] **Step 4: Le choix des figures**

Dans `decks-page.tsx`, remplacer l'état `pattern` par une liste ordonnée. Le sélecteur actuel devient une suite de cases à cocher, dans l'ordre de `PATTERN_KEYS`, et l'ordre de la liste est l'ordre de cochage :

```tsx
  const [patterns, setPatterns] = useState<PatternKey[]>(['linea']);

  function togglePattern(key: PatternKey): void {
    setPatterns((actuel) =>
      actuel.includes(key) ? actuel.filter((k) => k !== key) : [...actuel, key],
    );
  }
```

Dans le JSX, à la place du sélecteur de figure, une case par figure avec l'étiquette qui **enveloppe** la case (association structurelle, sans `id` à tenir synchronisé) :

```tsx
          <fieldset>
            <legend className="text-sm">{tGame('patterns')}</legend>
            {PATTERN_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={patterns.includes(key)}
                  onChange={() => togglePattern(key)}
                  data-testid={`pattern-${key}`}
                />
                {tPattern(key)}
              </label>
            ))}
          </fieldset>
```

Et le corps envoyé porte `patterns` au lieu de `pattern`. Le bouton de création est désactivé quand `patterns.length === 0`.

- [ ] **Step 5: La progression chez l'animatrice**

Dans `animator-page.tsx`, afficher la progression à côté de la figure, en lisant l'instantané :

⚠️ **Corrige le 05/11 : ce bloc utilisait `tGame` et `tPattern`, qui n'existent pas dans cet
ecran.** `animator-page.tsx` n'a qu'un seul traducteur, `const t = useTranslations('module.loto')`,
et appelle ses cles en `t('game.xxx')`. Il faut donc ajouter le traducteur de figures, sur le modele
de `decks-page.tsx` qui fait deja exactement ca :

```tsx
  const tPattern = useTranslations('module.loto.pattern');
```

Ce motif evite une cle dynamique : l'espace est deja reduit, et `snapshot.game.pattern` est un
`PatternKey`, donc une union fermee. Ne construis **jamais** la cle par concatenation
(`t('pattern.' + ...)`), ce serait une chaine libre que le typage ne retient plus.

```tsx
        {snapshot.game.patternTotal > 1 && (
          <p data-testid="pattern-progress">
            {t('game.patternProgress', {
              position: snapshot.game.patternPosition,
              total: snapshot.game.patternTotal,
              pattern: tPattern(snapshot.game.pattern),
            })}
          </p>
        )}
```

Affichée seulement au-delà d'une figure : une partie à figure unique n'a pas de progression à montrer, et l'afficher serait du bruit.

- [ ] **Step 6: Vérifier**

Run: `pnpm turbo run lint typecheck test`
Expected: PASS. Rapporter les nombres réels. Si la parité des catalogues rougit, c'est qu'une clé manque dans un des trois.

- [ ] **Step 7: Commit**

```bash
git add packages/module-loto/src/presentation packages/module-loto/src/i18n
git commit -m "feat(loto): choisir les figures a enchainer, et voir la progression"
```

---

### Task 11: L'E2E

❓ **Question d'ergonomie laissee a Sylvain, trouvee en ecrivant ce test.** La progression
n'apparait qu'une fois la partie lancee, parce que l'ecran animateur sort tot pour `draft` et
`open`. Avant le premier tirage, l'animatrice ne voit donc pas la chaine qu'elle vient de choisir.
L'afficher des l'ouverture lui permettrait de verifier son reglage pendant que les eleves scannent,
avant que la classe ne regarde. Ce n'est pas demande par la spec, et ca coute une condition : a
trancher, pas a decider ici.
**Files:**
- Create: `e2e/tests/enchainer-les-figures.e2e.spec.ts`

- [ ] **Step 1: Choisir des figures rapides**

⚠️ Une partie menée jusqu'à la `llena` demande presque tout le paquet, donc un test long. Prendre `esquinas` puis `linea` : les deux tombent en une poignée de tirages sur une tabla choisie.

- [ ] **Step 2: Écrire le test**

Le montage reprend celui de `loto-guest.e2e.spec.ts` : `login(page)` remplit le formulaire,
`bearer(page)` lit le JWT sur `/api/auth/token`, et la partie se crée par `page.request.post`.

```ts
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env['SEED_OWNER_EMAIL'] ?? 'elda@test.dev';
const PASSWORD = process.env['SEED_OWNER_PASSWORD'] ?? 'TestPassword123!';
const PROGRESS_1 = /(figure 1 sur 2|pattern 1 of 2|figura 1 de 2)/i;
const PROGRESS_2 = /(figure 2 sur 2|pattern 2 of 2|figura 2 de 2)/i;

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/e-mail|email/i).fill(EMAIL);
  await page.getByLabel(/password|mot de passe|contraseña/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|se connecter|iniciar/i }).click();
  await page.waitForURL(/\/dashboard/);
}

async function bearer(page: Page): Promise<string> {
  const res = await page.request.get('/api/auth/token');
  expect(res.ok(), 'le host doit rendre un JWT à une session connectée').toBeTruthy();
  const body = (await res.json()) as { token?: string };
  return body.token ?? '';
}

interface DeckSummary {
  id: string;
  cardCount: number;
}

test('une partie enchaine deux figures sans etre recreee', async ({ page }) => {
  test.slow();
  await login(page);
  const auth = { Authorization: `Bearer ${await bearer(page)}` };

  const decksRes = await page.request.get('/api/modules/loto/decks', { headers: auth });
  const { decks } = (await decksRes.json()) as { decks: DeckSummary[] };
  const deck = decks.find((candidate) => candidate.cardCount >= 54);
  expect(deck, 'le seed du Lotería doit avoir posé la lotería traditionnelle').toBeDefined();

  // `esquinas` puis `linea` : les deux tombent en une poignée de tirages. La
  // `llena` demanderait presque tout le paquet et ferait un test d une minute.
  // Pénalité à zéro : la boucle réclame à chaque tour et ne doit pas se
  // bloquer elle-même.
  const createRes = await page.request.post('/api/modules/loto/games', {
    headers: auth,
    data: {
      deckId: deck?.id,
      patterns: ['esquinas', 'linea'],
      maxTeams: 6,
      falseClaimPenaltyDraws: 0,
    },
  });
  expect(createRes.ok()).toBeTruthy();
  const game = (await createRes.json()) as { id: string; joinCode: string };
  const codeInitial = game.joinCode;

  expect((await page.request.post(`/api/modules/loto/games/${game.id}/open`, { headers: auth })).ok()).toBeTruthy();

  await page.goto(`/modules/loto/games/${game.id}`);

  // ⚠️ Corrige le 05/11 : la progression n existe PAS encore a l ecran ici.
  // `animator-page.tsx` sort tot pour les statuts `draft` et `open`, et la
  // ligne `pattern-progress` vit dans le retour final, qui ne couvre que
  // `running` et `finished`. Il faut donc un premier tirage avant de la lire.
  await page.getByTestId('draw').click();
  await expect(page.getByTestId('pattern-progress')).toHaveText(PROGRESS_1);

  // Tirer jusqu à ce que la progression passe à la seconde figure. La boucle
  // ne calcule pas quand `esquinas` est complète : elle tire et regarde, ce
  // qui ne duplique pas la règle du domaine dans le test.
  for (let i = 0; i < 54; i++) {
    if (await page.getByTestId('pattern-progress').textContent().then((t) => PROGRESS_2.test(t ?? ''))) break;
    try {
      await page.getByTestId('draw').click({ timeout: 4000 });
    } catch {
      break;
    }
    await page.waitForTimeout(60);
  }

  await expect(page.getByTestId('pattern-progress')).toHaveText(PROGRESS_2);

  // Tout l objet de l issue : la partie n a pas été recréée, donc les
  // téléphones n ont rien à rescanner.
  const relu = await page.request.get(`/api/modules/loto/games/${game.id}`, { headers: auth });
  const apres = (await relu.json()) as { joinCode: string; status: string };
  expect(apres.joinCode).toBe(codeInitial);
  expect(apres.status).toBe('running');
});
```

⚠️ Deux points à vérifier en écrivant, et à corriger sur place plutôt qu à contourner : le
`data-testid="draw"` du bouton de tirage vient de `loto-guest.e2e.spec.ts`, et la route de
relecture d une partie doit exister. Si `GET /api/modules/loto/games/:id` n est pas exposée,
lire le code d entrée sur l écran plutôt que par l API, et le dire.
- [ ] **Step 3: Lancer les E2E en local**

⛔ **Ne jamais lancer `pnpm dev`** : il lit `.env.local`, qui pointe sur la base Neon de production.

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
PORT=3011 pnpm --filter quetzal-api start &
pnpm --filter quetzal-host exec next start -p 3010 &
```

Ne PAS exporter `NODE_ENV=production` : les scripts de semence refusent volontairement de tourner dans ce cas. Le script `start` de l'hôte code le port 3000 en dur, d'où le `next start -p 3010`.

Run: `CI=1 pnpm exec playwright test e2e/tests/enchainer-les-figures.e2e.spec.ts --reporter=list`
Expected: `1 passed`. `CI=1` neutralise le `webServer` de la configuration, qui irait sinon chercher le port 3000.

- [ ] **Step 4: Non-régression sur toute la suite**

Run: `CI=1 pnpm exec playwright test --reporter=list`
Expected: tout vert. Rapporter le nombre réel.

- [ ] **Step 5: Arrêter les serveurs**

Les deux serveurs tournent en arrière-plan : les arrêter avant de finir, et vérifier que les ports 3010 et 3011 ne répondent plus.

- [ ] **Step 6: Commit**

```bash
git add e2e/tests/enchainer-les-figures.e2e.spec.ts
git commit -m "test(e2e): une partie enchaine deux figures sans etre recreee"
```

---

## Clôture

- [ ] `pnpm turbo run lint typecheck` → attendu 26/26
- [ ] `pnpm turbo run test` → attendu 17/17 tâches
- [ ] `pnpm turbo run test:integration` → attendu 12/12
- [ ] `pnpm audit --prod --audit-level high` → attendu 0 high, sortie 0
- [ ] `pnpm --filter @quetzal/auth generate && git diff --exit-code -- packages/auth/prisma/auth.prisma` → aucune dérive
- [ ] **Avant de fusionner** : compter les lignes que la migration a remplies en production, comme pour la migration d'unicité du 03/11. Une réclamation sans figure après migration serait un remplissage manqué.
- [ ] ⛔ **Les onze tâches partent en UNE SEULE pull request squashée.** La migration de la tâche 3
      et l'adaptateur de la tâche 5 doivent arriver en production dans le même déploiement. Déployer
      la migration seule casserait toute création et toute lecture de partie : c'est mesuré, la suite
      d'intégration tombe à 16 échecs sur 33 dans cet état intermédiaire.
- [ ] **Après le déploiement**, ouvrir le second temps : issue #52 (`patterns` en `NOT NULL`, retrait de
      `Loto_Game.pattern`, de la double écriture et du repli de lecture).
