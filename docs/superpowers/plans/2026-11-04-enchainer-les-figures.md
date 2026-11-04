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
| `packages/core/src/events/loto.ts` | `LotoPatternWonEvent` (le fichier n'existe pas encore) |
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

-- 5. la figure unique disparait, remplacee par une liste a une entree
ALTER TABLE "Loto_Game" DROP COLUMN "pattern";
```

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

- [ ] **Step 7: Constater que le typecheck est ROUGE, et ne rien y faire**

Run: `pnpm --filter @quetzal/module-loto typecheck`
Expected: **ÉCHEC**, et c'est normal. Six sites de `prisma-game.repository.ts` lisent encore
`row.pattern` ou `input.settings.pattern`, colonne que cette tâche vient de retirer. La tâche 4
change le port et la tâche 5 l'adaptateur : l'arbre redevient vert à la fin de la 5.

⛔ **Ne corrige rien hors du périmètre de cette tâche.** Rapporte la liste des erreurs pour qu'on
vérifie qu'elles portent bien toutes sur `pattern`, et rien d'autre.

⚠️ À traiter en tâche 5, noté ici pour ne pas l'oublier : `prisma-game.repository.ts:92` fait
`throw new Error(...)`, ce que le §14 interdit. Préexistant, pas introduit par ce chantier, mais la
tâche 5 réécrit ce mappage : c'est le bon moment, au titre de « améliorer le code qu'on touche ».

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

Étendre le port casse tout ce qui construit un `GameSettings` ou un `GameState`. Dix specs partagent la constante `SETTINGS` : y remplacer `pattern: 'linea'` par `patterns: ['linea']`. La doublure `fake-repositories.ts` reçoit `patternIndex: 0` à la création, plus les deux nouvelles méthodes :

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
Expected: PASS. Rapporter la liste des fichiers qu'il a fallu toucher.

- [ ] **Step 5: Commit**

```bash
git add packages/module-loto/src/domain/ports packages/module-loto/src/application/testing packages/module-loto/src
git commit -m "feat(loto): le port porte la liste, l index et le compare-and-set"
```

---

### Task 5: La persistance (TDD strict)

**Files:**
- Modify: `packages/module-loto/src/infrastructure/prisma-game.repository.ts`
- Test: `packages/module-loto/src/infrastructure/prisma-game.repository.integration.spec.ts`

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

Dans `GameRow`, remplacer `pattern: string;` par `patterns: string;` et ajouter `patternIndex: number;`. Dans l'interface `LotoPrisma`, `loto_Game` gagne `updateMany` s'il ne l'a pas déjà, et `loto_Claim` gagne `count`.

Dans `toState`, traduire :

```ts
        patterns: parsePatternList(row.patterns),
```

et au niveau de l'état, `patternIndex: row.patternIndex`.

Dans `create`, écrire :

```ts
        patterns: serializePatternList(input.settings.patterns),
```

Les deux nouvelles méthodes :

```ts
  async advancePattern(gameId: string, depuisIndex: number): Promise<boolean> {
    // La condition est dans le WHERE : c est Postgres qui arbitre la course,
    // pas nous. `updateMany` rend le nombre de lignes touchées.
    // ⚠️ Pas de `as` ici (§8) : dans l interface `LotoPrisma`, declarer
    // `updateMany(args: unknown): Promise<{ count: number }>` pour `loto_Game`
    // plutot que `Promise<unknown>`. Le typage de la frontiere remplace le cast.
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

---

### Task 6: La réclamation avance ou termine (TDD strict)

Le cœur. C'est la logique la plus porteuse du module : elle décide des victoires et des pénalités. Une erreur ici ne se voit pas en relisant le code, elle se voit en classe.

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

```ts
  async patternChanged(gameId: string): Promise<void> {
    const snapshot = await this.snapshot.execute({ gameId });
    this.emit(this.room(gameId), 'pattern-changed', {
      pattern: snapshot.game.pattern,
      position: snapshot.game.patternPosition,
      total: snapshot.game.patternTotal,
    });
  }
```

Puis l'appeler là où `claimResult` est appelé, quand la réclamation était valide et que la partie n'est pas terminée.

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
- Modify: `packages/module-loto/src/presentation/dto/loto.dto.ts`
- Modify: `packages/module-loto/src/presentation/game.controller.ts`
- Modify: `packages/module-loto/src/presentation/ui/decks-page.tsx`
- Modify: `packages/module-loto/src/presentation/ui/animator-page.tsx`
- Modify: `packages/module-loto/src/i18n/{fr,en,es}.json`

- [ ] **Step 1: La validation d'entrée**

Dans `createGameSchema`, remplacer `pattern: z.enum(PATTERN_KEYS),` par :

```ts
  // De une à quatre, sans doublon : `isValidPatternList` porte la règle, le
  // schéma ne fait que l appeler pour ne pas la dire deux fois.
  patterns: z
    .array(z.enum(PATTERN_KEYS))
    .refine(isValidPatternList, { message: 'liste de figures invalide' }),
```

- [ ] **Step 2: Le contrôleur passe la liste**

Remplacer `pattern: parsed.data.pattern,` par `patterns: parsed.data.patterns,`.

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

```tsx
        {snapshot.game.patternTotal > 1 && (
          <p data-testid="pattern-progress">
            {tGame('patternProgress', {
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
