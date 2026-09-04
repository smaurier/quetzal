# Module Lotería — Plan d'implémentation

> **Pour les agents exécutants :** SOUS-SKILL REQUISE. Utiliser `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les étapes sont des cases à cocher (`- [ ]`).

**Objectif :** livrer `packages/module-loto`, une lotería mexicaine jouable en classe, où l'enseignante compose ses jeux de cartes et anime la partie pendant que les élèves jouent sur leur téléphone.

**Architecture :** Clean Architecture dans le module, comme `module-hello`. Le domaine est pur et exhaustivement testé, c'est lui qui porte l'invariant central : le serveur revalide toute réclamation à partir de la suite des tirages, jamais à partir du marquage du client. Les commandes de l'animatrice passent en HTTP, la diffusion aux joueurs en WebSocket. La partie fige son jeu de cartes au lancement.

**Pile technique :** TypeScript strict, NestJS 10, Prisma 6 sur Postgres, socket.io, React 19 et Next 15 côté écrans, Vitest, testcontainers, Playwright.

**Spec de référence :** `docs/superpowers/specs/2026-09-03-quetzal-module-loto-design.md`. Toute divergence entre ce plan et la spec doit être signalée, pas tranchée en silence.

---

## Avant de commencer

Lire dans l'ordre :

1. `CLAUDE.md`, en particulier la frontière noyau et module, la convention de base de données, la convention de tests et la sécurité WebSocket.
2. `docs/module-contract.md`, en entier. Il contient trois pièges qui ont chacun coûté une session : les deux entrées d'un module, l'obligation de déclarer chaque message dans la matrice de permissions, et le fait que Nest répond à un message socket par un événement et jamais par un accusé de réception.
3. La spec du module, sections 4 et 5.

Le module de référence est `packages/module-hello`. Quand une question de structure se pose, la réponse est presque toujours « comme dans hello ».

**Trois pièges déjà payés, à ne pas repayer :**

- `tenantId` et tout identifiant d'utilisateur sont des chaînes simples, jamais `@db.Uuid`. Les identifiants Better-Auth ne sont pas des UUID.
- Un import dynamique à gabarit sur `@quetzal/module-*` fait exploser le build de l'hôte. Le chargement passe par la carte statique générée.
- Les catalogues de traduction doivent avoir une parité stricte des clés entre les trois langues, sinon la suite de contrat échoue.

## Structure des fichiers

```
packages/module-loto/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── vitest.integration.config.ts
├── prisma/
│   └── models.prisma                     tables Loto_*
├── src/
│   ├── index.ts                          exporte manifest et LotoModule
│   ├── client.ts                         clientManifest, entrée navigateur
│   ├── manifest.ts                       manifeste serveur
│   ├── loto.module.ts                    module NestJS
│   ├── domain/                           pur, zéro dépendance framework
│   │   ├── errors.ts                     erreurs de domaine typées
│   │   ├── pattern.ts                    les quatre figures, prédicats purs
│   │   ├── tabla.ts                      génération et projection en grille
│   │   ├── claim.ts                      validation d'une réclamation
│   │   ├── penalty.ts                    blocage après fausse réclamation
│   │   ├── game-status.ts                machine à états de la partie
│   │   ├── team-assignment.ts            répartition en équipes
│   │   ├── join-code.ts                  génération du code court
│   │   └── ports/
│   │       ├── deck.repository.ts
│   │       ├── game.repository.ts
│   │       └── card-image.store.ts
│   ├── application/                      cas d'usage
│   │   ├── create-game.use-case.ts
│   │   ├── open-game.use-case.ts
│   │   ├── draw-card.use-case.ts
│   │   ├── join-game.use-case.ts
│   │   ├── toggle-mark.use-case.ts
│   │   ├── claim.use-case.ts
│   │   ├── list-decks.use-case.ts
│   │   ├── duplicate-deck.use-case.ts
│   │   ├── edit-card.use-case.ts
│   │   └── delete-deck.use-case.ts
│   ├── infrastructure/
│   │   ├── prisma-deck.repository.ts
│   │   ├── prisma-game.repository.ts
│   │   ├── prisma-card-image.store.ts
│   │   └── seed-traditional-deck.ts      les 54 cartes livrées
│   ├── presentation/
│   │   ├── deck.controller.ts
│   │   ├── game.controller.ts
│   │   ├── image.controller.ts
│   │   ├── loto.gateway.ts
│   │   ├── dto/                          schémas Zod des entrées
│   │   └── ui/
│   │       ├── decks-page.tsx
│   │       ├── deck-editor.tsx
│   │       ├── animator-page.tsx
│   │       ├── guest-join.tsx            écran joueur, monté par la plateforme
│   │       └── components/
│   │           ├── tabla-grid.tsx
│   │           ├── card-face.tsx
│   │           └── draw-ribbon.tsx
│   └── i18n/{fr,en,es}.json
└── tests/
    └── manifest.spec.ts                  runContractSuite

packages/core/src/events/loto.ts          types des événements publiés
e2e/tests/loto-guest.e2e.spec.ts          parcours invité complet
```

Chaque fichier du domaine a une seule responsabilité et se lit d'un coup. C'est voulu : c'est la couche la plus testée et celle où une erreur coûte le plus cher.

---

## Étape 1 — Domaine

But de l'étape : toute la logique de jeu, pure, sans base ni framework, exhaustivement testée. À la fin, on peut jouer une partie entière en mémoire dans un test.

### Tâche 1 : Squelette du paquet

**Fichiers :**
- Créer : `packages/module-loto/package.json`
- Créer : `packages/module-loto/tsconfig.json`
- Créer : `packages/module-loto/vitest.config.ts`
- Créer : `packages/module-loto/vitest.integration.config.ts`

- [ ] **Étape 1 : créer `package.json`**

```json
{
  "name": "@quetzal/module-loto",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./manifest": "./dist/manifest.js",
    "./client": "./dist/client.js"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.15",
    "@nestjs/websockets": "^10.4.15",
    "@nestjs/platform-socket.io": "^10.4.15",
    "socket.io": "^4.8.1",
    "socket.io-client": "^4.8.1",
    "zod": "^3.24.1",
    "react": "^19.0.0",
    "next-intl": "^3.26.3",
    "@quetzal/core": "workspace:*",
    "@quetzal/db": "workspace:*",
    "@quetzal/ui": "workspace:*"
  },
  "devDependencies": {
    "@prisma/client": "^6.19.3",
    "@quetzal/config": "workspace:*",
    "@nestjs/testing": "^10.4.15",
    "@nestjs/platform-express": "^10.4.15",
    "@types/react": "^19.0.2",
    "typescript": "^5.7.2",
    "vitest": "^3.2.7"
  }
}
```

- [ ] **Étape 2 : créer `tsconfig.json`**

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

- [ ] **Étape 3 : créer `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.spec.ts'],
  },
});
```

- [ ] **Étape 4 : créer `vitest.integration.config.ts`**

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
    hookTimeout: 120_000,
  },
});
```

- [ ] **Étape 5 : installer et vérifier**

Lancer : `pnpm install`
Attendu : `Done in ...`, et `packages/module-loto/node_modules/@quetzal/` contient `core`, `db`, `ui`.

- [ ] **Étape 6 : commit**

```bash
git add packages/module-loto pnpm-lock.yaml
git commit -m "chore(module-loto): scaffold du paquet

Structure et configuration identiques à module-hello. Aucun code métier.
Exempté du cycle test-first au titre de CLAUDE.md paragraphe 5, scaffolding."
```

### Tâche 2 : Erreurs de domaine

**Fichiers :**
- Créer : `packages/module-loto/src/domain/errors.ts`
- Test : `packages/module-loto/src/domain/errors.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { DomainError } from '@quetzal/core';
import {
  DeckTooSmallError,
  InvalidGameTransitionError,
  TeamBlockedError,
  GameNotRunningError,
} from './errors.js';

describe('erreurs du domaine loto', () => {
  it('héritent toutes de DomainError du noyau', () => {
    expect(new DeckTooSmallError(9)).toBeInstanceOf(DomainError);
    expect(new InvalidGameTransitionError('draft', 'finished')).toBeInstanceOf(DomainError);
    expect(new TeamBlockedError(15)).toBeInstanceOf(DomainError);
    expect(new GameNotRunningError('open')).toBeInstanceOf(DomainError);
  });

  it('portent leur nom de classe, pour que le filtre global les distingue', () => {
    expect(new DeckTooSmallError(9).name).toBe('DeckTooSmallError');
  });

  it('donnent le contexte utile dans le message', () => {
    expect(new DeckTooSmallError(9).message).toContain('9');
    expect(new DeckTooSmallError(9).message).toContain('16');
    expect(new InvalidGameTransitionError('draft', 'finished').message).toContain('draft');
    expect(new TeamBlockedError(15).message).toContain('15');
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/errors.spec.ts`
Attendu : ÉCHEC, `Cannot find module './errors.js'`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

```ts
import { DomainError } from '@quetzal/core';

export class DeckTooSmallError extends DomainError {
  constructor(size: number) {
    super(`Un jeu de cartes doit contenir au moins 16 cartes, celui-ci en a ${size}`);
  }
}

export class InvalidGameTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`Transition de partie interdite : ${from} vers ${to}`);
  }
}

export class TeamBlockedError extends DomainError {
  constructor(untilDraw: number) {
    super(`Équipe bloquée jusqu'au tirage ${untilDraw}`);
  }
}

export class GameNotRunningError extends DomainError {
  constructor(status: string) {
    super(`Action impossible : la partie est à l'état ${status}`);
  }
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/errors.spec.ts`
Attendu : `Tests 3 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/domain/errors.ts packages/module-loto/src/domain/errors.spec.ts
git commit -m "test(module-loto): erreurs de domaine typées

feat(module-loto): erreurs de domaine héritant de DomainError"
```

Note pour l'exécutant : ce commit est le seul du plan à fusionner test et implémentation, parce que le test ne décrit rien d'autre que l'existence des classes. Tous les suivants sont en deux commits séparés, `test:` puis `feat:`.

### Tâche 3 : Les quatre figures

C'est le cœur du jeu. Le test est volontairement exhaustif : une figure fausse ne se voit pas en relecture, elle se voit en test.

**Fichiers :**
- Créer : `packages/module-loto/src/domain/pattern.ts`
- Test : `packages/module-loto/src/domain/pattern.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { matchesPattern, PATTERN_KEYS, type Grid, type PatternKey } from './pattern.js';

// Une grille se lit ligne par ligne : les cases 0 à 3 forment la première ligne.
function grid(...marked: number[]): Grid {
  const cells = new Array<boolean>(16).fill(false);
  for (const i of marked) cells[i] = true;
  return cells;
}

const EMPTY = grid();
const FULL = grid(...Array.from({ length: 16 }, (_, i) => i));

describe('PATTERN_KEYS', () => {
  it('énumère les quatre figures de la spec', () => {
    expect([...PATTERN_KEYS]).toEqual(['linea', 'esquinas', 'centro', 'llena']);
  });
});

describe('matchesPattern — linea', () => {
  it('reconnaît les quatre lignes', () => {
    expect(matchesPattern(grid(0, 1, 2, 3), 'linea')).toBe(true);
    expect(matchesPattern(grid(4, 5, 6, 7), 'linea')).toBe(true);
    expect(matchesPattern(grid(8, 9, 10, 11), 'linea')).toBe(true);
    expect(matchesPattern(grid(12, 13, 14, 15), 'linea')).toBe(true);
  });

  it('reconnaît les quatre colonnes', () => {
    expect(matchesPattern(grid(0, 4, 8, 12), 'linea')).toBe(true);
    expect(matchesPattern(grid(1, 5, 9, 13), 'linea')).toBe(true);
    expect(matchesPattern(grid(2, 6, 10, 14), 'linea')).toBe(true);
    expect(matchesPattern(grid(3, 7, 11, 15), 'linea')).toBe(true);
  });

  it('reconnaît les deux diagonales', () => {
    expect(matchesPattern(grid(0, 5, 10, 15), 'linea')).toBe(true);
    expect(matchesPattern(grid(3, 6, 9, 12), 'linea')).toBe(true);
  });

  it('refuse une ligne incomplète', () => {
    expect(matchesPattern(grid(0, 1, 2), 'linea')).toBe(false);
  });

  it('refuse quatre cases alignées sur rien', () => {
    expect(matchesPattern(grid(0, 1, 2, 7), 'linea')).toBe(false);
    expect(matchesPattern(grid(1, 4, 11, 14), 'linea')).toBe(false);
  });

  it('refuse une grille vide', () => {
    expect(matchesPattern(EMPTY, 'linea')).toBe(false);
  });
});

describe('matchesPattern — esquinas', () => {
  it('reconnaît les quatre coins', () => {
    expect(matchesPattern(grid(0, 3, 12, 15), 'esquinas')).toBe(true);
  });

  it('refuse trois coins sur quatre', () => {
    expect(matchesPattern(grid(0, 3, 12), 'esquinas')).toBe(false);
    expect(matchesPattern(grid(0, 3, 15), 'esquinas')).toBe(false);
  });

  it('accepte des coins accompagnés d’autres cases', () => {
    expect(matchesPattern(grid(0, 3, 12, 15, 5, 6), 'esquinas')).toBe(true);
  });
});

describe('matchesPattern — centro', () => {
  it('reconnaît le carré central', () => {
    expect(matchesPattern(grid(5, 6, 9, 10), 'centro')).toBe(true);
  });

  it('refuse un carré décalé', () => {
    expect(matchesPattern(grid(4, 5, 8, 9), 'centro')).toBe(false);
  });

  it('refuse trois cases du centre', () => {
    expect(matchesPattern(grid(5, 6, 9), 'centro')).toBe(false);
  });
});

describe('matchesPattern — llena', () => {
  it('reconnaît la grille complète', () => {
    expect(matchesPattern(FULL, 'llena')).toBe(true);
  });

  it('refuse quinze cases sur seize', () => {
    expect(matchesPattern(grid(...Array.from({ length: 15 }, (_, i) => i)), 'llena')).toBe(false);
  });
});

describe('matchesPattern — indépendance des figures', () => {
  it('une grille pleine satisfait toutes les figures', () => {
    for (const key of PATTERN_KEYS) {
      expect(matchesPattern(FULL, key satisfies PatternKey)).toBe(true);
    }
  });

  it('une grille vide n’en satisfait aucune', () => {
    for (const key of PATTERN_KEYS) {
      expect(matchesPattern(EMPTY, key)).toBe(false);
    }
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/pattern.spec.ts`
Attendu : ÉCHEC, `Cannot find module './pattern.js'`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

```ts
export const PATTERN_KEYS = ['linea', 'esquinas', 'centro', 'llena'] as const;
export type PatternKey = (typeof PATTERN_KEYS)[number];

/** Grille d'une tabla, seize cases lues ligne par ligne. */
export type Grid = readonly boolean[];

export const TABLA_ROWS = 4;
export const TABLA_COLS = 4;
export const TABLA_SIZE = TABLA_ROWS * TABLA_COLS;

const ROWS = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 11],
  [12, 13, 14, 15],
];
const COLS = [
  [0, 4, 8, 12],
  [1, 5, 9, 13],
  [2, 6, 10, 14],
  [3, 7, 11, 15],
];
const DIAGONALS = [
  [0, 5, 10, 15],
  [3, 6, 9, 12],
];
const CORNERS = [0, 3, 12, 15];
const CENTER = [5, 6, 9, 10];
const ALL = Array.from({ length: TABLA_SIZE }, (_, i) => i);

function allMarked(grid: Grid, cells: readonly number[]): boolean {
  return cells.every((i) => grid[i] === true);
}

const PREDICATES: Record<PatternKey, (grid: Grid) => boolean> = {
  linea: (grid) => [...ROWS, ...COLS, ...DIAGONALS].some((line) => allMarked(grid, line)),
  esquinas: (grid) => allMarked(grid, CORNERS),
  centro: (grid) => allMarked(grid, CENTER),
  llena: (grid) => allMarked(grid, ALL),
};

export function matchesPattern(grid: Grid, pattern: PatternKey): boolean {
  return PREDICATES[pattern](grid);
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/pattern.spec.ts`
Attendu : `Tests 17 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/domain/pattern.spec.ts
git commit -m "test(module-loto): les quatre figures gagnantes, cas positifs et négatifs"
git add packages/module-loto/src/domain/pattern.ts
git commit -m "feat(module-loto): prédicats purs des quatre figures

Chaque figure est un prédicat sur une grille de seize booléens. En ajouter une
cinquième ne touche à rien d'autre que cette table."
```

### Tâche 4 : Tabla, génération et projection

**Fichiers :**
- Créer : `packages/module-loto/src/domain/tabla.ts`
- Test : `packages/module-loto/src/domain/tabla.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { DeckTooSmallError } from './errors.js';
import { generateTabla, projectTabla, MIN_DECK_SIZE } from './tabla.js';

const deck = (n: number): string[] => Array.from({ length: n }, (_, i) => `c${i + 1}`);

/** Générateur déterministe : rend les valeurs fournies, puis boucle. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('MIN_DECK_SIZE', () => {
  it('vaut seize, la taille d une tabla', () => {
    expect(MIN_DECK_SIZE).toBe(16);
  });
});

describe('generateTabla', () => {
  it('rend seize cartes', () => {
    expect(generateTabla(deck(54), Math.random)).toHaveLength(16);
  });

  it('ne répète jamais une carte', () => {
    const tabla = generateTabla(deck(54), Math.random);
    expect(new Set(tabla).size).toBe(16);
  });

  it('ne rend que des cartes du jeu', () => {
    const cards = deck(54);
    for (const id of generateTabla(cards, Math.random)) {
      expect(cards).toContain(id);
    }
  });

  it('accepte un jeu de seize cartes exactement, et rend alors tout le jeu', () => {
    const cards = deck(16);
    expect([...generateTabla(cards, Math.random)].sort()).toEqual([...cards].sort());
  });

  it('refuse un jeu trop petit', () => {
    expect(() => generateTabla(deck(15), Math.random)).toThrow(DeckTooSmallError);
  });

  it('est reproductible à générateur identique', () => {
    const cards = deck(54);
    const a = generateTabla(cards, sequence([0.1, 0.9, 0.5, 0.3, 0.7]));
    const b = generateTabla(cards, sequence([0.1, 0.9, 0.5, 0.3, 0.7]));
    expect(a).toEqual(b);
  });

  it('produit des tablas différentes à générateurs différents', () => {
    const cards = deck(54);
    const a = generateTabla(cards, sequence([0.1, 0.2, 0.3]));
    const b = generateTabla(cards, sequence([0.9, 0.8, 0.7]));
    expect(a).not.toEqual(b);
  });
});

describe('projectTabla', () => {
  it('marque les cases dont la carte a été tirée', () => {
    const tabla = deck(16);
    const drawn = new Set(['c1', 'c16']);
    const grid = projectTabla(tabla, drawn);
    expect(grid[0]).toBe(true);
    expect(grid[15]).toBe(true);
    expect(grid[1]).toBe(false);
  });

  it('rend toujours seize cases', () => {
    expect(projectTabla(deck(16), new Set())).toHaveLength(16);
  });

  it('ignore les cartes tirées absentes de la tabla', () => {
    const grid = projectTabla(deck(16), new Set(['c99', 'c1']));
    expect(grid.filter(Boolean)).toHaveLength(1);
  });

  it('respecte l ordre de la tabla', () => {
    const cards = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'];
    const grid = projectTabla(cards, new Set(['c']));
    expect(grid[2]).toBe(true);
    expect(grid.filter(Boolean)).toHaveLength(1);
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/tabla.spec.ts`
Attendu : ÉCHEC, `Cannot find module './tabla.js'`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

```ts
import { DeckTooSmallError } from './errors.js';
import { TABLA_SIZE, type Grid } from './pattern.js';

export const MIN_DECK_SIZE = TABLA_SIZE;

/**
 * Tire seize cartes sans remise. Le générateur est injecté pour rendre les tests
 * déterministes : aucun appel direct à Math.random dans le domaine.
 */
export function generateTabla(deckCardIds: readonly string[], random: () => number): string[] {
  if (deckCardIds.length < MIN_DECK_SIZE) throw new DeckTooSmallError(deckCardIds.length);

  const pool = [...deckCardIds];
  const picked: string[] = [];
  while (picked.length < TABLA_SIZE) {
    const index = Math.floor(random() * pool.length) % pool.length;
    picked.push(pool.splice(index, 1)[0]!);
  }
  return picked;
}

/**
 * Projette une tabla en grille de booléens à partir des cartes réellement tirées.
 * C est la seule entrée légitime d une validation de réclamation : jamais les
 * marquages du client.
 */
export function projectTabla(tablaCardIds: readonly string[], drawnCardIds: ReadonlySet<string>): Grid {
  return tablaCardIds.map((id) => drawnCardIds.has(id));
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/tabla.spec.ts`
Attendu : `Tests 12 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/domain/tabla.spec.ts
git commit -m "test(module-loto): génération de tabla et projection en grille"
git add packages/module-loto/src/domain/tabla.ts
git commit -m "feat(module-loto): tabla de seize cartes sans remise, générateur injecté"
```

### Tâche 5 : Validation de réclamation

Invariant central du module, décision D1 de la spec. Le test le plus important est celui qui prouve qu un client menteur n obtient rien.

**Fichiers :**
- Créer : `packages/module-loto/src/domain/claim.ts`
- Test : `packages/module-loto/src/domain/claim.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { isWinningClaim } from './claim.js';

const TABLA = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'];

describe('isWinningClaim', () => {
  it('valide une ligne réellement tirée', () => {
    expect(isWinningClaim({
      tablaCardIds: TABLA,
      drawnCardIds: new Set(['a', 'b', 'c', 'd']),
      pattern: 'linea',
    })).toBe(true);
  });

  it('refuse une ligne incomplète', () => {
    expect(isWinningClaim({
      tablaCardIds: TABLA,
      drawnCardIds: new Set(['a', 'b', 'c']),
      pattern: 'linea',
    })).toBe(false);
  });

  it('valide le carton plein', () => {
    expect(isWinningClaim({
      tablaCardIds: TABLA,
      drawnCardIds: new Set(TABLA),
      pattern: 'llena',
    })).toBe(true);
  });

  it('ne tient aucun compte des cartes tirées absentes de la tabla', () => {
    expect(isWinningClaim({
      tablaCardIds: TABLA,
      drawnCardIds: new Set(['x', 'y', 'z', 'a', 'b', 'c']),
      pattern: 'linea',
    })).toBe(false);
  });

  it('refuse une réclamation quand rien n a été tiré', () => {
    expect(isWinningClaim({
      tablaCardIds: TABLA,
      drawnCardIds: new Set(),
      pattern: 'linea',
    })).toBe(false);
  });

  it('valide indépendamment de l ordre des tirages', () => {
    const a = isWinningClaim({ tablaCardIds: TABLA, drawnCardIds: new Set(['a', 'b', 'c', 'd']), pattern: 'linea' });
    const b = isWinningClaim({ tablaCardIds: TABLA, drawnCardIds: new Set(['d', 'c', 'b', 'a']), pattern: 'linea' });
    expect(a).toBe(b);
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/claim.spec.ts`
Attendu : ÉCHEC, `Cannot find module './claim.js'`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

```ts
import { matchesPattern, type PatternKey } from './pattern.js';
import { projectTabla } from './tabla.js';

export interface ClaimInput {
  tablaCardIds: readonly string[];
  /** Cartes réellement tirées par le serveur. Seule source de vérité. */
  drawnCardIds: ReadonlySet<string>;
  pattern: PatternKey;
}

/**
 * Décision D1 de la spec : le serveur ne lit jamais le marquage du client.
 * Cette signature n accepte volontairement aucune entrée qui en viendrait.
 * Ajouter un tel paramètre rouvrirait la triche par marquage falsifié.
 */
export function isWinningClaim(input: ClaimInput): boolean {
  return matchesPattern(projectTabla(input.tablaCardIds, input.drawnCardIds), input.pattern);
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/claim.spec.ts`
Attendu : `Tests 6 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/domain/claim.spec.ts
git commit -m "test(module-loto): validation de réclamation, y compris le client menteur"
git add packages/module-loto/src/domain/claim.ts
git commit -m "feat(module-loto): validation de réclamation à partir des seuls tirages

Décision D1 de la spec. La signature n accepte aucune entrée provenant du
client, ce qui rend la triche par marquage falsifié sans objet."
```

### Tâche 6 : Pénalité de fausse réclamation

**Fichiers :**
- Créer : `packages/module-loto/src/domain/penalty.ts`
- Test : `packages/module-loto/src/domain/penalty.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { isBlocked, blockUntil, NO_PENALTY } from './penalty.js';

describe('blockUntil', () => {
  it('sans pénalité configurée, ne bloque rien', () => {
    expect(blockUntil(12, 0)).toBe(NO_PENALTY);
  });

  it('bloque jusqu au tirage courant plus la pénalité', () => {
    expect(blockUntil(12, 3)).toBe(15);
  });

  it('accepte une pénalité volontairement énorme, qui écarte l équipe de fait', () => {
    expect(blockUntil(12, 9999)).toBe(10011);
  });
});

describe('isBlocked', () => {
  it('ne bloque pas quand aucune pénalité ne court', () => {
    expect(isBlocked(NO_PENALTY, 12)).toBe(false);
  });

  it('bloque tant que le tirage courant est strictement inférieur à la borne', () => {
    expect(isBlocked(15, 12)).toBe(true);
    expect(isBlocked(15, 14)).toBe(true);
  });

  it('libère l équipe au tirage de la borne', () => {
    expect(isBlocked(15, 15)).toBe(false);
    expect(isBlocked(15, 16)).toBe(false);
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/penalty.spec.ts`
Attendu : ÉCHEC, `Cannot find module './penalty.js'`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

```ts
export const NO_PENALTY = 0;

/**
 * Rang de tirage à partir duquel une équipe peut réclamer de nouveau.
 * La pénalité se compte en tours et non en secondes : le tirage est manuel,
 * il n existe aucune horloge partagée entre l animatrice et les téléphones.
 */
export function blockUntil(currentDrawOrder: number, penaltyDraws: number): number {
  if (penaltyDraws <= 0) return NO_PENALTY;
  return currentDrawOrder + penaltyDraws;
}

export function isBlocked(blockedUntilDraw: number, currentDrawOrder: number): boolean {
  if (blockedUntilDraw === NO_PENALTY) return false;
  return currentDrawOrder < blockedUntilDraw;
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/penalty.spec.ts`
Attendu : `Tests 6 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/domain/penalty.spec.ts
git commit -m "test(module-loto): blocage après fausse réclamation, bornes comprises"
git add packages/module-loto/src/domain/penalty.ts
git commit -m "feat(module-loto): pénalité comptée en tours de tirage"
```

### Tâche 7 : Machine à états de la partie

**Fichiers :**
- Créer : `packages/module-loto/src/domain/game-status.ts`
- Test : `packages/module-loto/src/domain/game-status.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { InvalidGameTransitionError } from './errors.js';
import {
  GAME_STATUSES,
  assertTransition,
  canTransition,
  canJoin,
  canDraw,
  canClaim,
  type GameStatus,
} from './game-status.js';

describe('GAME_STATUSES', () => {
  it('énumère les quatre états de la spec', () => {
    expect([...GAME_STATUSES]).toEqual(['draft', 'open', 'running', 'finished']);
  });
});

describe('canTransition', () => {
  it('autorise le chemin nominal', () => {
    expect(canTransition('draft', 'open')).toBe(true);
    expect(canTransition('open', 'running')).toBe(true);
    expect(canTransition('running', 'finished')).toBe(true);
  });

  it('autorise l arrêt anticipé par l animatrice', () => {
    expect(canTransition('open', 'finished')).toBe(true);
  });

  it('interdit de sauter l ouverture', () => {
    expect(canTransition('draft', 'running')).toBe(false);
  });

  it('interdit tout retour en arrière', () => {
    expect(canTransition('running', 'open')).toBe(false);
    expect(canTransition('finished', 'running')).toBe(false);
    expect(canTransition('open', 'draft')).toBe(false);
  });

  it('interdit de rester sur place', () => {
    for (const s of GAME_STATUSES) expect(canTransition(s, s)).toBe(false);
  });
});

describe('assertTransition', () => {
  it('ne lève rien sur une transition permise', () => {
    expect(() => assertTransition('draft', 'open')).not.toThrow();
  });

  it('lève une erreur de domaine sur une transition interdite', () => {
    expect(() => assertTransition('draft', 'finished' as GameStatus)).toThrow(InvalidGameTransitionError);
  });
});

describe('actions permises par état', () => {
  it('on ne rejoint qu une partie ouverte', () => {
    expect(canJoin('open')).toBe(true);
    expect(canJoin('draft')).toBe(false);
    expect(canJoin('running')).toBe(false);
    expect(canJoin('finished')).toBe(false);
  });

  it('on tire depuis une partie ouverte ou en cours', () => {
    expect(canDraw('open')).toBe(true);
    expect(canDraw('running')).toBe(true);
    expect(canDraw('draft')).toBe(false);
    expect(canDraw('finished')).toBe(false);
  });

  it('on ne réclame que dans une partie en cours', () => {
    expect(canClaim('running')).toBe(true);
    expect(canClaim('open')).toBe(false);
    expect(canClaim('finished')).toBe(false);
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/game-status.spec.ts`
Attendu : ÉCHEC, `Cannot find module './game-status.js'`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

```ts
import { InvalidGameTransitionError } from './errors.js';

export const GAME_STATUSES = ['draft', 'open', 'running', 'finished'] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

const ALLOWED: Record<GameStatus, readonly GameStatus[]> = {
  draft: ['open'],
  // open vers finished : l animatrice referme une partie que personne n a jouée.
  open: ['running', 'finished'],
  running: ['finished'],
  finished: [],
};

export function canTransition(from: GameStatus, to: GameStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: GameStatus, to: GameStatus): void {
  if (!canTransition(from, to)) throw new InvalidGameTransitionError(from, to);
}

/** On rejoint avant le premier tirage, comme on entre en classe avant le cours. */
export function canJoin(status: GameStatus): boolean {
  return status === 'open';
}

/** Le premier tirage fait passer la partie de open à running. */
export function canDraw(status: GameStatus): boolean {
  return status === 'open' || status === 'running';
}

export function canClaim(status: GameStatus): boolean {
  return status === 'running';
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/game-status.spec.ts`
Attendu : `Tests 11 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/domain/game-status.spec.ts
git commit -m "test(module-loto): machine à états, transitions interdites comprises"
git add packages/module-loto/src/domain/game-status.ts
git commit -m "feat(module-loto): machine à états et actions permises par état"
```

### Tâche 8 : Répartition en équipes

Décision D3 de la spec : un joueur seul est une équipe d un, et le domaine ne connaît que des équipes.

**Fichiers :**
- Créer : `packages/module-loto/src/domain/team-assignment.ts`
- Test : `packages/module-loto/src/domain/team-assignment.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { assignTeam, type TeamLoad } from './team-assignment.js';

const teams = (...counts: number[]): TeamLoad[] =>
  counts.map((memberCount, i) => ({ id: `t${i + 1}`, memberCount }));

describe('assignTeam', () => {
  it('crée une équipe tant que le maximum n est pas atteint', () => {
    expect(assignTeam(teams(), 6)).toEqual({ kind: 'new' });
    expect(assignTeam(teams(1, 1, 1), 6)).toEqual({ kind: 'new' });
    expect(assignTeam(teams(1, 1, 1, 1, 1), 6)).toEqual({ kind: 'new' });
  });

  it('remplit une équipe existante une fois le maximum atteint', () => {
    expect(assignTeam(teams(1, 1, 1, 1, 1, 1), 6)).toEqual({ kind: 'existing', teamId: 't1' });
  });

  it('choisit toujours l équipe la moins remplie', () => {
    expect(assignTeam(teams(3, 1, 2, 2, 2, 2), 6)).toEqual({ kind: 'existing', teamId: 't2' });
  });

  it('à effectifs égaux, choisit la première, ce qui rend la répartition déterministe', () => {
    expect(assignTeam(teams(2, 2, 2, 2, 2, 2), 6)).toEqual({ kind: 'existing', teamId: 't1' });
  });

  it('accepte que les équipes finissent inégales', () => {
    let loads = teams();
    for (let i = 0; i < 32; i++) {
      const decision = assignTeam(loads, 6);
      if (decision.kind === 'new') {
        loads = [...loads, { id: `t${loads.length + 1}`, memberCount: 1 }];
      } else {
        loads = loads.map((t) => (t.id === decision.teamId ? { ...t, memberCount: t.memberCount + 1 } : t));
      }
    }
    expect(loads).toHaveLength(6);
    expect(loads.reduce((sum, t) => sum + t.memberCount, 0)).toBe(32);
    const counts = loads.map((t) => t.memberCount).sort((a, b) => a - b);
    expect(counts[counts.length - 1]! - counts[0]!).toBeLessThanOrEqual(1);
  });

  it('avec un maximum d une seule équipe, tout le monde joue ensemble', () => {
    expect(assignTeam(teams(), 1)).toEqual({ kind: 'new' });
    expect(assignTeam(teams(5), 1)).toEqual({ kind: 'existing', teamId: 't1' });
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/team-assignment.spec.ts`
Attendu : ÉCHEC, `Cannot find module './team-assignment.js'`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

```ts
export interface TeamLoad {
  id: string;
  memberCount: number;
}

export type TeamAssignment = { kind: 'new' } | { kind: 'existing'; teamId: string };

/**
 * Décision D3 : tant qu il reste de la place, chaque arrivant forme sa propre
 * équipe et possède sa tabla. Au-delà, il rejoint la moins remplie. Les équipes
 * finissent donc souvent inégales, ce qui est sans effet sur le jeu.
 */
export function assignTeam(teams: readonly TeamLoad[], maxTeams: number): TeamAssignment {
  if (teams.length < maxTeams) return { kind: 'new' };

  let lightest = teams[0]!;
  for (const team of teams) {
    if (team.memberCount < lightest.memberCount) lightest = team;
  }
  return { kind: 'existing', teamId: lightest.id };
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/team-assignment.spec.ts`
Attendu : `Tests 6 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/domain/team-assignment.spec.ts
git commit -m "test(module-loto): répartition en équipes, dont les effectifs inégaux"
git add packages/module-loto/src/domain/team-assignment.ts
git commit -m "feat(module-loto): répartition équilibrée, un joueur seul est une équipe d un"
```

### Tâche 9 : Code d entrée court

**Fichiers :**
- Créer : `packages/module-loto/src/domain/join-code.ts`
- Test : `packages/module-loto/src/domain/join-code.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { generateJoinCode, JOIN_CODE_LENGTH, JOIN_CODE_ALPHABET } from './join-code.js';

describe('generateJoinCode', () => {
  it('fait la longueur annoncée', () => {
    expect(generateJoinCode(Math.random)).toHaveLength(JOIN_CODE_LENGTH);
  });

  it('n emploie que l alphabet retenu', () => {
    for (const ch of generateJoinCode(Math.random)) {
      expect(JOIN_CODE_ALPHABET).toContain(ch);
    }
  });

  it('évite les caractères qu un élève confondrait de loin', () => {
    for (const ambiguous of ['O', '0', 'I', '1', 'L']) {
      expect(JOIN_CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it('est reproductible à générateur identique', () => {
    const fixed = () => 0.5;
    expect(generateJoinCode(fixed)).toBe(generateJoinCode(fixed));
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/join-code.spec.ts`
Attendu : ÉCHEC, `Cannot find module './join-code.js'`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

```ts
/** Sans O, 0, I, 1 ni L : le code est lu de loin sur un écran projeté. */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;

export function generateJoinCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    const index = Math.floor(random() * JOIN_CODE_ALPHABET.length) % JOIN_CODE_ALPHABET.length;
    code += JOIN_CODE_ALPHABET[index];
  }
  return code;
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/join-code.spec.ts`
Attendu : `Tests 4 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/domain/join-code.spec.ts
git commit -m "test(module-loto): code d entrée court, sans caractères ambigus"
git add packages/module-loto/src/domain/join-code.ts
git commit -m "feat(module-loto): génération du code d entrée"
```

### Tâche 10 : Partie complète jouée en mémoire

Ce test n ajoute aucun code de production. Il prouve que les pièces s assemblent et sert de documentation exécutable des règles.

**Fichiers :**
- Test : `packages/module-loto/src/domain/game.spec.ts`

- [ ] **Étape 1 : écrire le test**

```ts
import { describe, it, expect } from 'vitest';
import { generateTabla } from './tabla.js';
import { isWinningClaim } from './claim.js';
import { blockUntil, isBlocked } from './penalty.js';
import { canClaim, canDraw, canJoin } from './game-status.js';

const DECK = Array.from({ length: 54 }, (_, i) => `card-${i + 1}`);

describe('une partie entière, jouée en mémoire', () => {
  it('se déroule du premier tirage à la victoire sur une ligne', () => {
    const tabla = generateTabla(DECK, Math.random);
    const drawn = new Set<string>();
    let order = 0;

    expect(canJoin('open')).toBe(true);
    expect(canDraw('open')).toBe(true);

    const firstRow = tabla.slice(0, 4);
    for (const card of firstRow) {
      order += 1;
      drawn.add(card);
    }

    expect(canClaim('running')).toBe(true);
    expect(isWinningClaim({ tablaCardIds: tabla, drawnCardIds: drawn, pattern: 'linea' })).toBe(true);
    expect(order).toBe(4);
  });

  it('rejette une réclamation prématurée puis bloque l équipe trois tours', () => {
    const tabla = generateTabla(DECK, Math.random);
    const drawn = new Set<string>([tabla[0]!, tabla[1]!, tabla[2]!]);
    const currentOrder = 3;

    expect(isWinningClaim({ tablaCardIds: tabla, drawnCardIds: drawn, pattern: 'linea' })).toBe(false);

    const blocked = blockUntil(currentOrder, 3);
    expect(blocked).toBe(6);
    expect(isBlocked(blocked, 4)).toBe(true);
    expect(isBlocked(blocked, 6)).toBe(false);
  });

  it('ne valide jamais une réclamation appuyée sur des cartes non tirées', () => {
    const tabla = generateTabla(DECK, Math.random);
    expect(isWinningClaim({ tablaCardIds: tabla, drawnCardIds: new Set(), pattern: 'llena' })).toBe(false);
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il passe sans code nouveau**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/game.spec.ts`
Attendu : `Tests 3 passed`. S il échoue, une tâche précédente est incomplète.

- [ ] **Étape 3 : lancer tout le domaine**

Lancer : `pnpm --filter @quetzal/module-loto test`
Attendu : environ `Tests 65 passed`, tâches 2 à 10 confondues.

- [ ] **Étape 4 : commit**

```bash
git add packages/module-loto/src/domain/game.spec.ts
git commit -m "test(module-loto): partie complète jouée en mémoire

Assemble les pièces du domaine sans base ni framework. Filet contre une
régression d intégration entre figures, tablas et pénalités."
```

**Fin de l étape 1.** Vérification de pureté du domaine, à lancer avant de passer à la suite :

Lancer : `grep -rE "@nestjs|@prisma|react|@quetzal/db" packages/module-loto/src/domain/`
Attendu : aucune correspondance. Le domaine ne connaît ni framework ni base.

---

## Étape 2 — Persistance et cas d usage

But de l étape : la partie se joue contre une vraie base, en appelant des cas d usage, sans encore aucun écran ni socket. À la fin, un test d intégration déroule une partie entière sur Postgres.

### Tâche 11 : Schéma Prisma et migration

**Fichiers :**
- Créer : `packages/module-loto/prisma/models.prisma`
- Créer : `packages/db/prisma/migrations/<horodatage>_add_module_loto/migration.sql`

Rappel du piège déjà payé : `tenantId` et tout identifiant d utilisateur ou d invité sont des chaînes simples. Les identifiants Better-Auth ne sont pas des UUID, et une colonne `@db.Uuid` produit une erreur P2023 au premier vrai appel.

- [ ] **Étape 1 : écrire `prisma/models.prisma`**

Reprendre littéralement la section 6 de la spec. Le fichier complet :

```prisma
model Loto_Deck {
  id          String
  tenantId    String
  name        String   @db.VarChar(120)
  isTemplate  Boolean  @default(false)
  createdBy   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  cards       Loto_Card[]
  games       Loto_Game[]

  @@id([id, tenantId])
  @@index([tenantId, name])
}

model Loto_Card {
  id        String
  tenantId  String
  deckId    String
  rank      Int
  label     String  @db.VarChar(80)
  imageId   String?

  deck      Loto_Deck  @relation(fields: [deckId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@id([id, tenantId])
  @@unique([deckId, rank, tenantId])
  @@index([tenantId, deckId])
}

model Loto_CardImage {
  id          String
  tenantId    String
  contentHash String   @db.VarChar(64)
  mimeType    String   @db.VarChar(40)
  bytes       Bytes
  createdAt   DateTime @default(now())

  @@id([id, tenantId])
  @@unique([contentHash, tenantId])
}

model Loto_Game {
  id                     String
  tenantId               String
  deckId                 String
  status                 String   @db.VarChar(16) @default("draft")
  pattern                String   @db.VarChar(16)
  falseClaimPenaltyDraws Int      @default(0)
  maxTeams               Int      @default(6)
  joinCode               String   @db.VarChar(8)
  createdBy              String
  createdAt              DateTime @default(now())
  startedAt              DateTime?
  finishedAt             DateTime?
  wonByTeamId            String?

  deck        Loto_Deck        @relation(fields: [deckId, tenantId], references: [id, tenantId], onDelete: Cascade)
  frozenCards Loto_GameCard[]
  teams       Loto_Team[]
  draws       Loto_Draw[]
  claims      Loto_Claim[]

  @@id([id, tenantId])
  @@unique([joinCode, tenantId])
  @@index([tenantId, status, createdAt])
}

model Loto_GameCard {
  id        String
  tenantId  String
  gameId    String
  rank      Int
  label     String  @db.VarChar(80)
  imageId   String?

  game      Loto_Game @relation(fields: [gameId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@id([id, tenantId])
  @@unique([gameId, rank, tenantId])
}

model Loto_Team {
  id               String
  tenantId         String
  gameId           String
  teamIndex        Int
  cardIds          Json
  markedCardIds    Json
  blockedUntilDraw Int     @default(0)

  game     Loto_Game     @relation(fields: [gameId, tenantId], references: [id, tenantId], onDelete: Cascade)
  members  Loto_Member[]

  @@id([id, tenantId])
  @@unique([gameId, teamIndex, tenantId])
  @@index([tenantId, gameId])
}

model Loto_Member {
  id          String
  tenantId    String
  gameId      String
  teamId      String
  guestId     String   @db.VarChar(64)
  displayName String   @db.VarChar(32)
  joinedAt    DateTime @default(now())

  team  Loto_Team @relation(fields: [teamId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@id([id, tenantId])
  @@unique([gameId, guestId, tenantId])
  @@index([tenantId, teamId])
}

model Loto_Draw {
  id        String
  tenantId  String
  gameId    String
  order     Int
  cardId    String
  drawnAt   DateTime @default(now())

  game  Loto_Game @relation(fields: [gameId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@id([id, tenantId])
  @@unique([gameId, order, tenantId])
  @@unique([gameId, cardId, tenantId])
}

model Loto_Claim {
  id         String
  tenantId   String
  gameId     String
  teamId     String
  atDraw     Int
  valid      Boolean
  claimedAt  DateTime @default(now())

  game  Loto_Game @relation(fields: [gameId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@id([id, tenantId])
  @@index([tenantId, gameId, claimedAt])
}
```

- [ ] **Étape 2 : fusionner le schéma et vérifier que Prisma l accepte**

Lancer : `pnpm --filter @quetzal/db schema:merge && pnpm --filter @quetzal/db prisma:generate`
Attendu : `[schema:merge] wrote ...` puis `Generated Prisma Client`. Aucune erreur P1012.

Si Prisma se plaint d une relation manquante, c est que le script de fusion n a pas ramassé le fichier. Vérifier que le chemin est bien `packages/module-loto/prisma/models.prisma`.

- [ ] **Étape 3 : produire la migration**

Lancer : `cd packages/db && pnpm exec prisma migrate dev --name add_module_loto --schema=prisma/schema.prisma`
Attendu : un dossier de migration créé, contenant les `CREATE TABLE` des neuf tables `Loto_*`.

- [ ] **Étape 4 : ajouter les contraintes de valeur**

Ouvrir le fichier `migration.sql` produit et ajouter à la fin :

```sql
-- Les valeurs contraintes le sont par CHECK et par Zod, jamais par une énumération Postgres.
ALTER TABLE "Loto_Game" ADD CONSTRAINT "Loto_Game_status_check"
  CHECK ("status" IN ('draft', 'open', 'running', 'finished'));
ALTER TABLE "Loto_Game" ADD CONSTRAINT "Loto_Game_pattern_check"
  CHECK ("pattern" IN ('linea', 'esquinas', 'centro', 'llena'));
ALTER TABLE "Loto_Game" ADD CONSTRAINT "Loto_Game_maxTeams_check"
  CHECK ("maxTeams" >= 1);
ALTER TABLE "Loto_Game" ADD CONSTRAINT "Loto_Game_penalty_check"
  CHECK ("falseClaimPenaltyDraws" >= 0);
```

- [ ] **Étape 5 : rejouer la migration sur une base neuve**

Lancer : `pnpm --filter @quetzal/core test:integration`
Attendu : les suites du noyau passent. Elles appliquent toutes les migrations sur une base vierge, donc elles valident la nouvelle.

- [ ] **Étape 6 : commit**

```bash
git add packages/module-loto/prisma/models.prisma packages/db/prisma/migrations
git commit -m "feat(module-loto): schéma Prisma et migration

Neuf tables préfixées Loto_. tenantId et identifiants d utilisateur en chaînes
simples : les identifiants Better-Auth ne sont pas des UUID. Contraintes de
valeur par CHECK, jamais par énumération Postgres.

Exempté du cycle test-first au titre de CLAUDE.md paragraphe 5, migration
générée. Les dépôts qui l exploitent sont testés aux tâches 14 et 15."
```

### Tâche 12 : Ports des dépôts

Interfaces seules, sans implémentation. Elles fixent le contrat que les cas d usage consomment et que l infrastructure honore.

**Fichiers :**
- Créer : `packages/module-loto/src/domain/ports/deck.repository.ts`
- Créer : `packages/module-loto/src/domain/ports/game.repository.ts`

- [ ] **Étape 1 : écrire `deck.repository.ts`**

```ts
export interface DeckCard {
  id: string;
  rank: number;
  label: string;
  imageId: string | null;
}

export interface DeckSummary {
  id: string;
  name: string;
  isTemplate: boolean;
  cardCount: number;
}

export interface Deck extends DeckSummary {
  cards: DeckCard[];
}

export interface NewDeckCard {
  rank: number;
  label: string;
  imageId: string | null;
}

export interface DeckRepository {
  list(): Promise<DeckSummary[]>;
  findById(deckId: string): Promise<Deck | null>;
  create(input: { name: string; isTemplate: boolean; createdBy: string; cards: NewDeckCard[] }): Promise<Deck>;
  rename(deckId: string, name: string): Promise<void>;
  updateCard(deckId: string, rank: number, patch: { label?: string; imageId?: string | null }): Promise<void>;
  delete(deckId: string): Promise<void>;
  /** Vrai si une partie non terminée s appuie sur ce jeu. Verrou de la décision D5. */
  hasUnfinishedGame(deckId: string): Promise<boolean>;
}
```

- [ ] **Étape 2 : écrire `game.repository.ts`**

```ts
import type { GameStatus } from '../game-status.js';
import type { PatternKey } from '../pattern.js';
import type { DeckCard, NewDeckCard } from './deck.repository.js';

export interface GameSettings {
  pattern: PatternKey;
  falseClaimPenaltyDraws: number;
  maxTeams: number;
}

export interface GameState {
  id: string;
  deckId: string;
  status: GameStatus;
  joinCode: string;
  settings: GameSettings;
  /** Rang du dernier tirage. Zéro quand rien n a encore été tiré. */
  lastDrawOrder: number;
  wonByTeamId: string | null;
}

export interface TeamState {
  id: string;
  /**
   * Rang de création, à partir de zéro. Le nom de l équipe n est pas stocké :
   * il se dérive de teamIndex et des membres via `teamNameFor` (spec 6.1). Une
   * équipe d un porte le nom de son membre, au-delà elle porte son numéro — en
   * stockant le nom, ce passage de un à deux membres deviendrait une transition
   * à gérer, et un libellé traduit finirait en base.
   */
  teamIndex: number;
  memberDisplayNames: string[];
  cardIds: string[];
  /**
   * Décision D2 : état partagé, sans autorité. Ce tableau ne participe JAMAIS à
   * une décision de jeu. Il est voisin de cardIds et de même type : c est le
   * point exact où une inattention rouvrirait la triche fermée par D1. La seule
   * protection structurelle est le brand DrawnCardId, qui rend
   * `drawnCardIds(team.markedCardIds)` compilable mais absurde à lire, et
   * `ClaimInput.drawnCardIds = new Set(team.markedCardIds)` impossible à compiler.
   */
  markedCardIds: string[];
  blockedUntilDraw: number;
}

export interface GameRepository {
  create(input: { deckId: string; createdBy: string; joinCode: string; settings: GameSettings }): Promise<GameState>;
  findById(gameId: string): Promise<GameState | null>;
  findByJoinCode(joinCode: string): Promise<GameState | null>;
  setStatus(gameId: string, status: GameStatus, patch?: { wonByTeamId?: string }): Promise<void>;

  /** Décision D5 : la partie copie les cartes dont elle a besoin au lancement. */
  freezeCards(gameId: string, cards: NewDeckCard[]): Promise<void>;
  frozenCards(gameId: string): Promise<DeckCard[]>;

  /** Triées par teamIndex croissant, pour que la répartition soit déterministe. */
  teams(gameId: string): Promise<TeamState[]>;
  createTeam(gameId: string, input: { teamIndex: number; cardIds: string[] }): Promise<TeamState>;
  setMarks(teamId: string, markedCardIds: string[]): Promise<void>;
  blockTeam(teamId: string, untilDraw: number): Promise<void>;

  findMember(gameId: string, guestId: string): Promise<{ teamId: string } | null>;
  addMember(input: { gameId: string; teamId: string; guestId: string; displayName: string }): Promise<void>;

  /**
   * Insère le tirage suivant. Rend faux si le rang ou la carte existe déjà,
   * ce qui rend un double appui sans effet plutôt qu erroné.
   */
  appendDraw(gameId: string, order: number, cardId: string): Promise<boolean>;
  /**
   * Registre des tirages du serveur, source de vérité de toute réclamation.
   * Nommé `drawnCards` et non `drawnCardIds` : ce dernier nom appartient à la
   * fabrique brandée du domaine (`domain/drawn-cards.ts`), et deux symboles
   * homonymes dont l un seul porte la garantie de provenance seraient un piège.
   */
  drawnCards(gameId: string): Promise<string[]>;

  recordClaim(input: { gameId: string; teamId: string; atDraw: number; valid: boolean }): Promise<void>;
}
```

- [ ] **Étape 3 : vérifier la compilation**

Lancer : `pnpm --filter @quetzal/module-loto typecheck`
Attendu : aucune erreur.

- [ ] **Étape 4 : commit**

```bash
git add packages/module-loto/src/domain/ports
git commit -m "feat(module-loto): ports des dépôts

Interfaces seules. Les cas d usage ne connaissent que ces contrats, jamais
Prisma. Exempté du cycle test-first : une interface sans implémentation n a
pas de comportement à tester ; les tests arrivent avec les adaptateurs."
```

### Tâche 13 : Jeu traditionnel livré

**Fichiers :**
- Créer : `packages/module-loto/src/infrastructure/traditional-deck.ts`
- Test : `packages/module-loto/src/infrastructure/traditional-deck.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { MIN_DECK_SIZE } from '../domain/tabla.js';
import { TRADITIONAL_DECK_NAME, TRADITIONAL_CARDS } from './traditional-deck.js';

describe('jeu traditionnel', () => {
  it('porte le nom espagnol du jeu', () => {
    expect(TRADITIONAL_DECK_NAME).toBe('Lotería tradicional');
  });

  it('compte les cinquante-quatre cartes du jeu', () => {
    expect(TRADITIONAL_CARDS).toHaveLength(54);
  });

  it('dépasse largement le minimum jouable', () => {
    expect(TRADITIONAL_CARDS.length).toBeGreaterThanOrEqual(MIN_DECK_SIZE);
  });

  it('numérote de un à cinquante-quatre sans trou ni doublon', () => {
    const ranks = TRADITIONAL_CARDS.map((c) => c.rank).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: 54 }, (_, i) => i + 1));
  });

  it('n a aucun nom vide ni dupliqué', () => {
    const labels = TRADITIONAL_CARDS.map((c) => c.label);
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(54);
  });

  it('ouvre et ferme sur les cartes canoniques', () => {
    expect(TRADITIONAL_CARDS[0]).toEqual({ rank: 1, label: 'El gallo', imageId: null });
    expect(TRADITIONAL_CARDS[53]).toEqual({ rank: 54, label: 'La rana', imageId: null });
  });

  it('ne porte aucune image : les illustrations traditionnelles sont protégées', () => {
    expect(TRADITIONAL_CARDS.every((c) => c.imageId === null)).toBe(true);
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/infrastructure/traditional-deck.spec.ts`
Attendu : ÉCHEC, `Cannot find module './traditional-deck.js'`.

- [ ] **Étape 3 : écrire l implémentation**

```ts
import type { NewDeckCard } from '../domain/ports/deck.repository.js';

export const TRADITIONAL_DECK_NAME = 'Lotería tradicional';

/**
 * Les cinquante-quatre cartes dans leur ordre canonique, noms seuls.
 * Aucune illustration n est livrée : celles du jeu traditionnel sont protégées.
 * L enseignante duplique ce jeu et y met les photos de son propre exemplaire.
 *
 * Note de contenu, section 7 de la spec : les cartes 26 et 38 portent des noms
 * datés que plusieurs éditions modernes ont changés. Le modèle garde la liste
 * canonique ; la duplication permet de les renommer en un geste.
 */
const LABELS = [
  'El gallo', 'El diablito', 'La dama', 'El catrín', 'El paraguas', 'La sirena',
  'La escalera', 'La botella', 'El barril', 'El árbol', 'El melón', 'El valiente',
  'El gorrito', 'La muerte', 'La pera', 'La bandera', 'El bandolón', 'El violoncello',
  'La garza', 'El pájaro', 'La mano', 'La bota', 'La luna', 'El cotorro',
  'El borracho', 'El negrito', 'El corazón', 'La sandía', 'El tambor', 'El camarón',
  'Las jaras', 'El músico', 'La araña', 'El soldado', 'La estrella', 'El cazo',
  'El mundo', 'El apache', 'El nopal', 'El alacrán', 'La rosa', 'La calavera',
  'La campana', 'El cantarito', 'El venado', 'El sol', 'La corona', 'La chalupa',
  'El pino', 'El pescado', 'La palma', 'La maceta', 'El arpa', 'La rana',
] as const;

export const TRADITIONAL_CARDS: readonly NewDeckCard[] = LABELS.map((label, i) => ({
  rank: i + 1,
  label,
  imageId: null,
}));
```

- [ ] **Étape 4 : lancer le test et vérifier qu il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/infrastructure/traditional-deck.spec.ts`
Attendu : `Tests 7 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/infrastructure/traditional-deck.spec.ts
git commit -m "test(module-loto): jeu traditionnel, numérotation et unicité des noms"
git add packages/module-loto/src/infrastructure/traditional-deck.ts
git commit -m "feat(module-loto): les cinquante-quatre cartes du jeu traditionnel

Noms seuls. Les illustrations traditionnelles étant protégées, l enseignante
duplique ce modèle et y met les photos de son propre exemplaire."
```

### Tâche 14 : Dépôt Prisma des jeux de cartes

**Fichiers :**
- Créer : `packages/module-loto/src/infrastructure/prisma-deck.repository.ts`
- Test : `packages/module-loto/src/infrastructure/prisma-deck.repository.integration.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { tenantStore } from '@quetzal/core';
import { PrismaDeckRepository } from './prisma-deck.repository.js';
import { TRADITIONAL_CARDS, TRADITIONAL_DECK_NAME } from './traditional-deck.js';

/** Exécute une fonction dans un contexte locataire, comme le feraient les middlewares. */
function inTenant<T>(tenantId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStore.run({ tenantId, userId, requestId: 'test' }, () => fn().then(resolve, reject));
  });
}

describe('PrismaDeckRepository (intégration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  it('crée un jeu avec ses cartes et le relit', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaDeckRepository();

    const created = await inTenant(tenantId, ownerId, () =>
      repo.create({ name: TRADITIONAL_DECK_NAME, isTemplate: true, createdBy: ownerId, cards: [...TRADITIONAL_CARDS] }),
    );

    expect(created.cards).toHaveLength(54);
    expect(created.isTemplate).toBe(true);

    const reloaded = await inTenant(tenantId, ownerId, () => repo.findById(created.id));
    expect(reloaded?.cards[0]?.label).toBe('El gallo');
    expect(reloaded?.cards[53]?.rank).toBe(54);
  });

  it('rend les cartes triées par rang', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaDeckRepository();
    const deck = await inTenant(tenantId, ownerId, () =>
      repo.create({
        name: 'Désordre', isTemplate: false, createdBy: ownerId,
        cards: [
          { rank: 3, label: 'Trois', imageId: null },
          { rank: 1, label: 'Un', imageId: null },
          { rank: 2, label: 'Deux', imageId: null },
        ],
      }),
    );
    const reloaded = await inTenant(tenantId, ownerId, () => repo.findById(deck.id));
    expect(reloaded?.cards.map((c) => c.rank)).toEqual([1, 2, 3]);
  });

  it('liste les jeux avec le nombre de cartes', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaDeckRepository();
    await inTenant(tenantId, ownerId, () =>
      repo.create({ name: 'A', isTemplate: false, createdBy: ownerId, cards: [{ rank: 1, label: 'x', imageId: null }] }),
    );
    const list = await inTenant(tenantId, ownerId, () => repo.list());
    expect(list).toHaveLength(1);
    expect(list[0]?.cardCount).toBe(1);
  });

  it('modifie le nom d une carte sans toucher aux autres', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaDeckRepository();
    const deck = await inTenant(tenantId, ownerId, () =>
      repo.create({
        name: 'Mien', isTemplate: false, createdBy: ownerId,
        cards: [
          { rank: 1, label: 'El gallo', imageId: null },
          { rank: 2, label: 'El diablito', imageId: null },
        ],
      }),
    );

    await inTenant(tenantId, ownerId, () => repo.updateCard(deck.id, 1, { label: 'El gallito' }));

    const reloaded = await inTenant(tenantId, ownerId, () => repo.findById(deck.id));
    expect(reloaded?.cards[0]?.label).toBe('El gallito');
    expect(reloaded?.cards[1]?.label).toBe('El diablito');
  });

  it('supprime un jeu et ses cartes', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const repo = new PrismaDeckRepository();
    const deck = await inTenant(tenantId, ownerId, () =>
      repo.create({ name: 'Jetable', isTemplate: false, createdBy: ownerId, cards: [{ rank: 1, label: 'x', imageId: null }] }),
    );

    await inTenant(tenantId, ownerId, () => repo.delete(deck.id));

    expect(await inTenant(tenantId, ownerId, () => repo.findById(deck.id))).toBeNull();
    expect(await inTenant(tenantId, ownerId, () => repo.list())).toHaveLength(0);
  });

  it('ne voit jamais le jeu d un autre locataire', async () => {
    const a = await seedTenant('A');
    const b = await seedTenant('B');
    const repo = new PrismaDeckRepository();

    await inTenant(a.tenantId, a.ownerId, () =>
      repo.create({ name: 'Secret de A', isTemplate: false, createdBy: a.ownerId, cards: [{ rank: 1, label: 'x', imageId: null }] }),
    );

    expect(await inTenant(b.tenantId, b.ownerId, () => repo.list())).toHaveLength(0);
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto test:integration`
Attendu : ÉCHEC, `Cannot find module './prisma-deck.repository.js'`.

- [ ] **Étape 3 : écrire l implémentation**

```ts
import { Injectable } from '@nestjs/common';
import { getTenantScopedPrisma } from '@quetzal/core';
import { newId } from '@quetzal/db';
import type {
  Deck, DeckRepository, DeckSummary, NewDeckCard,
} from '../domain/ports/deck.repository.js';

interface DeckRow { id: string; name: string; isTemplate: boolean }
interface CardRow { id: string; rank: number; label: string; imageId: string | null }

interface LotoPrisma {
  loto_Deck: {
    findMany(args?: unknown): Promise<DeckRow[]>;
    findUnique(args: unknown): Promise<DeckRow | null>;
    create(args: unknown): Promise<DeckRow>;
    update(args: unknown): Promise<DeckRow>;
    delete(args: unknown): Promise<DeckRow>;
  };
  loto_Card: {
    findMany(args: unknown): Promise<CardRow[]>;
    createMany(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
    count(args: unknown): Promise<number>;
  };
  loto_Game: { count(args: unknown): Promise<number> };
}

@Injectable()
export class PrismaDeckRepository implements DeckRepository {
  private get prisma(): LotoPrisma {
    return getTenantScopedPrisma() as unknown as LotoPrisma;
  }

  async list(): Promise<DeckSummary[]> {
    const decks = await this.prisma.loto_Deck.findMany({ orderBy: { name: 'asc' } });
    const summaries: DeckSummary[] = [];
    for (const deck of decks) {
      const cardCount = await this.prisma.loto_Card.count({ where: { deckId: deck.id } });
      summaries.push({ id: deck.id, name: deck.name, isTemplate: deck.isTemplate, cardCount });
    }
    return summaries;
  }

  async findById(deckId: string): Promise<Deck | null> {
    const deck = await this.prisma.loto_Deck.findUnique({ where: { id: deckId } });
    if (!deck) return null;
    const cards = await this.prisma.loto_Card.findMany({
      where: { deckId },
      orderBy: { rank: 'asc' },
    });
    return { id: deck.id, name: deck.name, isTemplate: deck.isTemplate, cardCount: cards.length, cards };
  }

  async create(input: { name: string; isTemplate: boolean; createdBy: string; cards: NewDeckCard[] }): Promise<Deck> {
    const deckId = newId();
    await this.prisma.loto_Deck.create({
      data: { id: deckId, name: input.name, isTemplate: input.isTemplate, createdBy: input.createdBy },
    });
    if (input.cards.length > 0) {
      await this.prisma.loto_Card.createMany({
        data: input.cards.map((card) => ({
          id: newId(), deckId, rank: card.rank, label: card.label, imageId: card.imageId,
        })),
      });
    }
    const created = await this.findById(deckId);
    if (!created) throw new Error('Jeu créé puis introuvable');
    return created;
  }

  async rename(deckId: string, name: string): Promise<void> {
    await this.prisma.loto_Deck.update({ where: { id: deckId }, data: { name } });
  }

  async updateCard(deckId: string, rank: number, patch: { label?: string; imageId?: string | null }): Promise<void> {
    await this.prisma.loto_Card.updateMany({ where: { deckId, rank }, data: patch });
  }

  async delete(deckId: string): Promise<void> {
    await this.prisma.loto_Deck.delete({ where: { id: deckId } });
  }

  async hasUnfinishedGame(deckId: string): Promise<boolean> {
    const count = await this.prisma.loto_Game.count({
      where: { deckId, status: { in: ['draft', 'open', 'running'] } },
    });
    return count > 0;
  }
}
```

Note d implémentation : `findUnique` sur une clé composite passe par l extension de cloisonnement du noyau, qui injecte le locataire. Ne jamais écrire `tenantId` à la main dans une requête d un module.

- [ ] **Étape 4 : lancer le test et vérifier qu il passe**

Lancer : `pnpm --filter @quetzal/module-loto test:integration`
Attendu : `Tests 6 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/infrastructure/prisma-deck.repository.integration.spec.ts
git commit -m "test(module-loto): dépôt des jeux de cartes contre un vrai Postgres

Couvre le cloisonnement entre locataires, qui est la propriété la plus
coûteuse à découvrir cassée en production."
git add packages/module-loto/src/infrastructure/prisma-deck.repository.ts
git commit -m "feat(module-loto): dépôt Prisma des jeux de cartes"
```

### Tâche 15 : Typeguards des valeurs contraintes

`Loto_Game.status` et `Loto_Game.pattern` sont des colonnes `String` en base, contraintes par `CHECK`. Le dépôt devra les rendre typées sans écrire `as`, que CLAUDE.md paragraphe 8 interdit sans typeguard préalable. Ces deux fonctions sont donc la frontière que la tâche 17 attend.

Elles ferment aussi un trou discret : `matchesPattern(grid, pattern)` fait `PREDICATES[pattern](grid)`. Un `Record` sur une union finie n est pas élargi par `noUncheckedIndexedAccess`, donc le compilateur ne peut pas prévenir qu une chaîne inattendue y provoquerait un `TypeError` nu.

**Fichiers :**
- Modifier : `packages/module-loto/src/domain/pattern.ts`
- Modifier : `packages/module-loto/src/domain/game-status.ts`
- Test : `packages/module-loto/src/domain/pattern.spec.ts`
- Test : `packages/module-loto/src/domain/game-status.spec.ts`

- [ ] **Étape 1 : écrire les tests qui échouent**

À ajouter à la fin de `pattern.spec.ts`, en dehors des `describe` existants :

```ts
describe('isPatternKey', () => {
  it('accepte les quatre clés', () => {
    for (const key of PATTERN_KEYS) expect(isPatternKey(key)).toBe(true);
  });

  it('refuse une chaîne qui n est pas une figure', () => {
    expect(isPatternKey('carton')).toBe(false);
    expect(isPatternKey('')).toBe(false);
    expect(isPatternKey('LINEA')).toBe(false);
  });
});
```

Et l import en tête du même fichier devient :

```ts
import { matchesPattern, isPatternKey, PATTERN_KEYS, type Grid, type PatternKey } from './pattern.js';
```

À ajouter à la fin de `game-status.spec.ts` :

```ts
describe('isGameStatus', () => {
  it('accepte les quatre états', () => {
    for (const status of GAME_STATUSES) expect(isGameStatus(status)).toBe(true);
  });

  it('refuse une chaîne qui n est pas un état', () => {
    expect(isGameStatus('paused')).toBe(false);
    expect(isGameStatus('')).toBe(false);
    expect(isGameStatus('Draft')).toBe(false);
  });
});
```

Et l import en tête devient :

```ts
import {
  GAME_STATUSES,
  assertTransition,
  canTransition,
  canJoin,
  canDraw,
  canClaim,
  isGameStatus,
  type GameStatus,
} from './game-status.js';
```

- [ ] **Étape 2 : lancer les tests et vérifier qu ils échouent**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/pattern.spec.ts src/domain/game-status.spec.ts`
Attendu : ÉCHEC. Le message exact dépend de la version de Vitest, mais il porte sur `isPatternKey` et `isGameStatus` qui ne sont pas des fonctions.

Piège déjà rencontré deux fois dans ce module : quand un symbole importé n existe pas encore, certains matchers dégénèrent en assertion vide et passent par accident. Ici `expect(isPatternKey('carton')).toBe(false)` lève bien, parce qu appeler `undefined` est une erreur. Vérifier tout de même que l échec porte le nom de la fonction manquante et pas autre chose.

- [ ] **Étape 3 : écrire l implémentation minimale**

À ajouter à la fin de `pattern.ts` :

```ts
export function isPatternKey(value: string): value is PatternKey {
  return (PATTERN_KEYS as readonly string[]).includes(value);
}
```

À ajouter à la fin de `game-status.ts` :

```ts
export function isGameStatus(value: string): value is GameStatus {
  return (GAME_STATUSES as readonly string[]).includes(value);
}
```

L élargissement `as readonly string[]` est nécessaire parce que `includes` d un tableau `as const` n accepte que les membres de l union, ce qui rendrait le typeguard tautologique. C est le seul `as` de ces deux fichiers et il ne porte sur aucune donnée, seulement sur le type du tableau littéral.

- [ ] **Étape 4 : lancer les tests et vérifier qu ils passent**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/pattern.spec.ts src/domain/game-status.spec.ts`
Attendu : `Tests 23 passed` sur les deux fichiers réunis, soit dix-neuf existants et quatre nouveaux.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/domain/pattern.spec.ts packages/module-loto/src/domain/game-status.spec.ts
git commit -m "test(module-loto): typeguards des figures et des états"
git add packages/module-loto/src/domain/pattern.ts packages/module-loto/src/domain/game-status.ts
git commit -m "feat(module-loto): isPatternKey et isGameStatus

Le dépôt relit deux colonnes String contraintes par CHECK. Ces typeguards
sont la frontière qui les retype sans le cast que CLAUDE.md paragraphe 8
interdit, et ferment le TypeError nu que matchesPattern lèverait sur une
valeur inattendue."
```

### Tâche 16 : Nom d une équipe

Règle de la spec, section 6.1 : une équipe d un porte le nom d affichage de son membre ; dès qu elle en compte plusieurs, elle porte un nom numéroté. C est une règle de domaine avec une transition dedans, le passage de un à deux membres, et elle n a pas d autre domicile que le domaine.

Le nom numéroté est traduit côté écran. Le domaine ne rend donc pas « Equipo 1 » mais la matière dont l écran fabriquera ce libellé.

**Fichiers :**
- Créer : `packages/module-loto/src/domain/team-name.ts`
- Test : `packages/module-loto/src/domain/team-name.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { teamNameFor } from './team-name.js';

describe('teamNameFor', () => {
  it('une équipe d un porte le nom de son membre', () => {
    expect(teamNameFor({ memberDisplayNames: ['Ana'], teamIndex: 0 })).toEqual({
      kind: 'member',
      displayName: 'Ana',
    });
  });

  it('dès deux membres, elle porte un numéro', () => {
    expect(teamNameFor({ memberDisplayNames: ['Ana', 'Beto'], teamIndex: 0 })).toEqual({
      kind: 'numbered',
      number: 1,
    });
  });

  it('numérote à partir de un, pas de zéro', () => {
    expect(teamNameFor({ memberDisplayNames: ['Ana', 'Beto'], teamIndex: 4 })).toEqual({
      kind: 'numbered',
      number: 5,
    });
  });

  it('une équipe vide porte quand même son numéro, elle vient d être créée', () => {
    expect(teamNameFor({ memberDisplayNames: [], teamIndex: 2 })).toEqual({
      kind: 'numbered',
      number: 3,
    });
  });

  it('ne rend jamais de libellé traduit, seulement de quoi le fabriquer', () => {
    const name = teamNameFor({ memberDisplayNames: ['Ana', 'Beto'], teamIndex: 0 });
    expect(JSON.stringify(name)).not.toContain('Equipo');
    expect(JSON.stringify(name)).not.toContain('Équipe');
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/team-name.spec.ts`
Attendu : ÉCHEC, `Cannot find module './team-name.js'`.

- [ ] **Étape 3 : écrire l implémentation minimale**

```ts
/**
 * Le domaine ne connaît aucune langue. Il rend de quoi fabriquer le libellé,
 * l écran applique la traduction. Spec section 6.1.
 */
export type TeamName =
  | { kind: 'member'; displayName: string }
  | { kind: 'numbered'; number: number };

export function teamNameFor(input: {
  memberDisplayNames: readonly string[];
  teamIndex: number;
}): TeamName {
  const [only] = input.memberDisplayNames;
  if (input.memberDisplayNames.length === 1 && only !== undefined) {
    return { kind: 'member', displayName: only };
  }
  return { kind: 'numbered', number: input.teamIndex + 1 };
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/team-name.spec.ts`
Attendu : `Tests 5 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/domain/team-name.spec.ts
git commit -m "test(module-loto): nom d équipe, du membre seul au numéro"
git add packages/module-loto/src/domain/team-name.ts
git commit -m "feat(module-loto): teamNameFor rend la matière du libellé, pas le libellé

Le domaine ne connaît aucune langue. Le passage d un membre à deux change le
nom : c est une règle de jeu, pas une décision d affichage."
```

### Tâche 17 : Dépôt Prisma des parties

Le plus gros adaptateur du module. Testé contre un vrai Postgres, parce que trois propriétés qui comptent ne sont vérifiables que là : le cloisonnement entre locataires, l unicité du tirage d une carte, et la cascade de suppression.

**Fichiers :**
- Créer : `packages/module-loto/src/infrastructure/prisma-game.repository.ts`
- Test : `packages/module-loto/src/infrastructure/prisma-game.repository.integration.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { tenantStore } from '@quetzal/core';
import { PrismaDeckRepository } from './prisma-deck.repository.js';
import { PrismaGameRepository } from './prisma-game.repository.js';
import { TRADITIONAL_CARDS, TRADITIONAL_DECK_NAME } from './traditional-deck.js';

function inTenant<T>(tenantId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStore.run({ tenantId, userId, requestId: 'test' }, () => fn().then(resolve, reject));
  });
}

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

describe('PrismaGameRepository (intégration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  async function aGame() {
    const { tenantId, ownerId } = await seedTenant();
    const decks = new PrismaDeckRepository();
    const games = new PrismaGameRepository();
    const deck = await inTenant(tenantId, ownerId, () =>
      decks.create({ name: TRADITIONAL_DECK_NAME, isTemplate: true, createdBy: ownerId, cards: [...TRADITIONAL_CARDS] }),
    );
    const game = await inTenant(tenantId, ownerId, () =>
      games.create({ deckId: deck.id, createdBy: ownerId, joinCode: 'ABC234', settings: { ...SETTINGS } }),
    );
    return { tenantId, ownerId, decks, games, deck, game };
  }

  it('crée une partie à l état draft et la relit par son code d entrée', async () => {
    const { tenantId, ownerId, games, game } = await aGame();

    expect(game.status).toBe('draft');
    expect(game.lastDrawOrder).toBe(0);
    expect(game.settings.maxTeams).toBe(6);

    const byCode = await inTenant(tenantId, ownerId, () => games.findByJoinCode('ABC234'));
    expect(byCode?.id).toBe(game.id);
  });

  it('retype status et pattern au lieu de rendre des chaînes nues', async () => {
    const { tenantId, ownerId, games, game } = await aGame();
    const reloaded = await inTenant(tenantId, ownerId, () => games.findById(game.id));
    expect(reloaded?.status).toBe('draft');
    expect(reloaded?.settings.pattern).toBe('linea');
  });

  it('fige les cartes du jeu et les relit triées par rang', async () => {
    const { tenantId, ownerId, games, game } = await aGame();

    await inTenant(tenantId, ownerId, () =>
      games.freezeCards(game.id, TRADITIONAL_CARDS.map((c) => ({ rank: c.rank, label: c.label, imageId: null }))),
    );

    const frozen = await inTenant(tenantId, ownerId, () => games.frozenCards(game.id));
    expect(frozen).toHaveLength(54);
    expect(frozen[0]?.rank).toBe(1);
    expect(frozen[0]?.label).toBe('El gallo');
    expect(frozen[53]?.rank).toBe(54);
  });

  it('une carte ne sort qu une fois, et un deuxième appui est sans effet', async () => {
    const { tenantId, ownerId, games, game } = await aGame();
    await inTenant(tenantId, ownerId, () =>
      games.freezeCards(game.id, TRADITIONAL_CARDS.map((c) => ({ rank: c.rank, label: c.label, imageId: null }))),
    );
    const frozen = await inTenant(tenantId, ownerId, () => games.frozenCards(game.id));
    const first = frozen[0]!;

    const ok = await inTenant(tenantId, ownerId, () => games.appendDraw(game.id, 1, first.id));
    expect(ok).toBe(true);

    const sameRank = await inTenant(tenantId, ownerId, () => games.appendDraw(game.id, 1, frozen[1]!.id));
    expect(sameRank).toBe(false);

    const sameCard = await inTenant(tenantId, ownerId, () => games.appendDraw(game.id, 2, first.id));
    expect(sameCard).toBe(false);

    const drawn = await inTenant(tenantId, ownerId, () => games.drawnCards(game.id));
    expect(drawn).toEqual([first.id]);
  });

  it('lastDrawOrder suit le dernier tirage', async () => {
    const { tenantId, ownerId, games, game } = await aGame();
    await inTenant(tenantId, ownerId, () =>
      games.freezeCards(game.id, TRADITIONAL_CARDS.map((c) => ({ rank: c.rank, label: c.label, imageId: null }))),
    );
    const frozen = await inTenant(tenantId, ownerId, () => games.frozenCards(game.id));

    await inTenant(tenantId, ownerId, () => games.appendDraw(game.id, 1, frozen[0]!.id));
    await inTenant(tenantId, ownerId, () => games.appendDraw(game.id, 2, frozen[1]!.id));

    const reloaded = await inTenant(tenantId, ownerId, () => games.findById(game.id));
    expect(reloaded?.lastDrawOrder).toBe(2);
  });

  it('crée une équipe, y ajoute un membre et rend les noms des membres', async () => {
    const { tenantId, ownerId, games, game } = await aGame();

    const team = await inTenant(tenantId, ownerId, () =>
      games.createTeam(game.id, { teamIndex: 0, cardIds: ['c1', 'c2'] }),
    );
    expect(team.teamIndex).toBe(0);
    expect(team.memberDisplayNames).toEqual([]);
    expect(team.cardIds).toEqual(['c1', 'c2']);
    expect(team.markedCardIds).toEqual([]);

    await inTenant(tenantId, ownerId, () =>
      games.addMember({ gameId: game.id, teamId: team.id, guestId: 'g-1', displayName: 'Ana' }),
    );

    const teams = await inTenant(tenantId, ownerId, () => games.teams(game.id));
    expect(teams).toHaveLength(1);
    expect(teams[0]?.memberDisplayNames).toEqual(['Ana']);
  });

  it('rend les équipes triées par teamIndex, pas par ordre d insertion', async () => {
    const { tenantId, ownerId, games, game } = await aGame();

    await inTenant(tenantId, ownerId, () => games.createTeam(game.id, { teamIndex: 2, cardIds: [] }));
    await inTenant(tenantId, ownerId, () => games.createTeam(game.id, { teamIndex: 0, cardIds: [] }));
    await inTenant(tenantId, ownerId, () => games.createTeam(game.id, { teamIndex: 1, cardIds: [] }));

    const teams = await inTenant(tenantId, ownerId, () => games.teams(game.id));
    expect(teams.map((t) => t.teamIndex)).toEqual([0, 1, 2]);
  });

  it('retrouve un invité déjà entré, ce qui rend la reconnexion idempotente', async () => {
    const { tenantId, ownerId, games, game } = await aGame();
    const team = await inTenant(tenantId, ownerId, () => games.createTeam(game.id, { teamIndex: 0, cardIds: [] }));
    await inTenant(tenantId, ownerId, () =>
      games.addMember({ gameId: game.id, teamId: team.id, guestId: 'g-1', displayName: 'Ana' }),
    );

    const found = await inTenant(tenantId, ownerId, () => games.findMember(game.id, 'g-1'));
    expect(found?.teamId).toBe(team.id);

    const absent = await inTenant(tenantId, ownerId, () => games.findMember(game.id, 'g-2'));
    expect(absent).toBeNull();
  });

  it('enregistre marquages et blocage sans les confondre', async () => {
    const { tenantId, ownerId, games, game } = await aGame();
    const team = await inTenant(tenantId, ownerId, () =>
      games.createTeam(game.id, { teamIndex: 0, cardIds: ['c1', 'c2', 'c3'] }),
    );

    await inTenant(tenantId, ownerId, () => games.setMarks(team.id, ['c1', 'c3']));
    await inTenant(tenantId, ownerId, () => games.blockTeam(team.id, 15));

    const teams = await inTenant(tenantId, ownerId, () => games.teams(game.id));
    expect(teams[0]?.markedCardIds).toEqual(['c1', 'c3']);
    expect(teams[0]?.cardIds).toEqual(['c1', 'c2', 'c3']);
    expect(teams[0]?.blockedUntilDraw).toBe(15);
  });

  it('bascule le statut et retient l équipe gagnante', async () => {
    const { tenantId, ownerId, games, game } = await aGame();
    const team = await inTenant(tenantId, ownerId, () => games.createTeam(game.id, { teamIndex: 0, cardIds: [] }));

    await inTenant(tenantId, ownerId, () => games.setStatus(game.id, 'open'));
    await inTenant(tenantId, ownerId, () => games.setStatus(game.id, 'finished', { wonByTeamId: team.id }));

    const reloaded = await inTenant(tenantId, ownerId, () => games.findById(game.id));
    expect(reloaded?.status).toBe('finished');
    expect(reloaded?.wonByTeamId).toBe(team.id);
  });

  it('cloisonne les parties entre locataires', async () => {
    const { game } = await aGame();
    const other = await seedTenant();
    const games = new PrismaGameRepository();

    const leaked = await inTenant(other.tenantId, other.ownerId, () => games.findById(game.id));
    expect(leaked).toBeNull();

    const leakedByCode = await inTenant(other.tenantId, other.ownerId, () => games.findByJoinCode('ABC234'));
    expect(leakedByCode).toBeNull();
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto test:integration`
Attendu : ÉCHEC, `Cannot find module './prisma-game.repository.js'`.

Le premier lancement télécharge l image Postgres du testcontainer et peut prendre plusieurs minutes. C est pour cela que `vitest.integration.config.ts` fixe `hookTimeout` à cent vingt secondes.

- [ ] **Étape 3 : écrire l implémentation minimale**

```ts
import { Injectable } from '@nestjs/common';
import { newId } from '@quetzal/db';
import { getTenantScopedPrisma } from '@quetzal/core';
import { isGameStatus, type GameStatus } from '../domain/game-status.js';
import { isPatternKey } from '../domain/pattern.js';
import type { DeckCard, NewDeckCard } from '../domain/ports/deck.repository.js';
import type {
  GameRepository,
  GameSettings,
  GameState,
  TeamState,
} from '../domain/ports/game.repository.js';

interface GameRow {
  id: string;
  deckId: string;
  status: string;
  pattern: string;
  falseClaimPenaltyDraws: number;
  maxTeams: number;
  joinCode: string;
  wonByTeamId: string | null;
}

interface TeamRow {
  id: string;
  teamIndex: number;
  cardIds: unknown;
  markedCardIds: unknown;
  blockedUntilDraw: number;
}

interface PrismaWithLoto {
  loto_Game: {
    create(args: { data: Record<string, unknown> }): Promise<GameRow>;
    findFirst(args: { where: Record<string, unknown> }): Promise<GameRow | null>;
    update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<GameRow>;
  };
  loto_GameCard: {
    createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }>;
    findMany(args: { where: Record<string, unknown>; orderBy: Record<string, unknown> }): Promise<DeckCard[]>;
  };
  loto_Team: {
    create(args: { data: Record<string, unknown> }): Promise<TeamRow>;
    findMany(args: { where: Record<string, unknown>; orderBy: Record<string, unknown> }): Promise<TeamRow[]>;
    update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<TeamRow>;
  };
  loto_Member: {
    findFirst(args: { where: Record<string, unknown> }): Promise<{ teamId: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: Record<string, unknown>;
    }): Promise<{ teamId: string; displayName: string }[]>;
  };
  loto_Draw: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(args: { where: Record<string, unknown>; orderBy: Record<string, unknown> }): Promise<{ cardId: string; order: number }[]>;
  };
  loto_Claim: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

/** Un tableau JSON relu de Postgres arrive en `unknown`. Aucun `as` sans garde. */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

@Injectable()
export class PrismaGameRepository implements GameRepository {
  private get prisma(): PrismaWithLoto {
    return getTenantScopedPrisma() as unknown as PrismaWithLoto;
  }

  private toState(row: GameRow, lastDrawOrder: number): GameState {
    if (!isGameStatus(row.status)) {
      throw new Error(`Statut de partie inconnu en base : ${row.status}`);
    }
    if (!isPatternKey(row.pattern)) {
      throw new Error(`Figure de partie inconnue en base : ${row.pattern}`);
    }
    return {
      id: row.id,
      deckId: row.deckId,
      status: row.status,
      joinCode: row.joinCode,
      settings: {
        pattern: row.pattern,
        falseClaimPenaltyDraws: row.falseClaimPenaltyDraws,
        maxTeams: row.maxTeams,
      },
      lastDrawOrder,
      wonByTeamId: row.wonByTeamId,
    };
  }

  private toTeam(row: TeamRow, memberDisplayNames: string[]): TeamState {
    return {
      id: row.id,
      teamIndex: row.teamIndex,
      memberDisplayNames,
      cardIds: toStringArray(row.cardIds),
      markedCardIds: toStringArray(row.markedCardIds),
      blockedUntilDraw: row.blockedUntilDraw,
    };
  }

  private async lastDrawOrder(gameId: string): Promise<number> {
    const draws = await this.prisma.loto_Draw.findMany({
      where: { gameId },
      orderBy: { order: 'desc' },
    });
    return draws[0]?.order ?? 0;
  }

  async create(input: {
    deckId: string;
    createdBy: string;
    joinCode: string;
    settings: GameSettings;
  }): Promise<GameState> {
    const row = await this.prisma.loto_Game.create({
      data: {
        id: newId(),
        deckId: input.deckId,
        createdBy: input.createdBy,
        joinCode: input.joinCode,
        status: 'draft',
        pattern: input.settings.pattern,
        falseClaimPenaltyDraws: input.settings.falseClaimPenaltyDraws,
        maxTeams: input.settings.maxTeams,
      },
    });
    return this.toState(row, 0);
  }

  async findById(gameId: string): Promise<GameState | null> {
    const row = await this.prisma.loto_Game.findFirst({ where: { id: gameId } });
    if (row === null) return null;
    return this.toState(row, await this.lastDrawOrder(gameId));
  }

  async findByJoinCode(joinCode: string): Promise<GameState | null> {
    const row = await this.prisma.loto_Game.findFirst({ where: { joinCode } });
    if (row === null) return null;
    return this.toState(row, await this.lastDrawOrder(row.id));
  }

  async setStatus(gameId: string, status: GameStatus, patch?: { wonByTeamId?: string }): Promise<void> {
    const data: Record<string, unknown> = { status };
    if (status === 'running') data['startedAt'] = new Date();
    if (status === 'finished') data['finishedAt'] = new Date();
    if (patch?.wonByTeamId !== undefined) data['wonByTeamId'] = patch.wonByTeamId;
    await this.prisma.loto_Game.update({ where: { id: gameId }, data });
  }

  async freezeCards(gameId: string, cards: NewDeckCard[]): Promise<void> {
    if (cards.length === 0) return;
    await this.prisma.loto_GameCard.createMany({
      data: cards.map((card) => ({
        id: newId(),
        gameId,
        rank: card.rank,
        label: card.label,
        imageId: card.imageId,
      })),
    });
  }

  async frozenCards(gameId: string): Promise<DeckCard[]> {
    return this.prisma.loto_GameCard.findMany({ where: { gameId }, orderBy: { rank: 'asc' } });
  }

  async teams(gameId: string): Promise<TeamState[]> {
    const rows = await this.prisma.loto_Team.findMany({
      where: { gameId },
      orderBy: { teamIndex: 'asc' },
    });
    const members = await this.prisma.loto_Member.findMany({
      where: { gameId },
      orderBy: { joinedAt: 'asc' },
    });
    const byTeam = new Map<string, string[]>();
    for (const member of members) {
      const names = byTeam.get(member.teamId) ?? [];
      names.push(member.displayName);
      byTeam.set(member.teamId, names);
    }
    return rows.map((row) => this.toTeam(row, byTeam.get(row.id) ?? []));
  }

  async createTeam(gameId: string, input: { teamIndex: number; cardIds: string[] }): Promise<TeamState> {
    const row = await this.prisma.loto_Team.create({
      data: {
        id: newId(),
        gameId,
        teamIndex: input.teamIndex,
        cardIds: input.cardIds,
        markedCardIds: [],
      },
    });
    return this.toTeam(row, []);
  }

  async setMarks(teamId: string, markedCardIds: string[]): Promise<void> {
    await this.prisma.loto_Team.update({ where: { id: teamId }, data: { markedCardIds } });
  }

  async blockTeam(teamId: string, untilDraw: number): Promise<void> {
    await this.prisma.loto_Team.update({ where: { id: teamId }, data: { blockedUntilDraw: untilDraw } });
  }

  async findMember(gameId: string, guestId: string): Promise<{ teamId: string } | null> {
    return this.prisma.loto_Member.findFirst({ where: { gameId, guestId } });
  }

  async addMember(input: {
    gameId: string;
    teamId: string;
    guestId: string;
    displayName: string;
  }): Promise<void> {
    await this.prisma.loto_Member.create({ data: { id: newId(), ...input } });
  }

  async appendDraw(gameId: string, order: number, cardId: string): Promise<boolean> {
    try {
      await this.prisma.loto_Draw.create({ data: { id: newId(), gameId, order, cardId } });
      return true;
    } catch {
      // Les deux contraintes d unicité de Loto_Draw rendent un double appui
      // sans effet plutôt qu erroné. Spec section 6.1.
      return false;
    }
  }

  async drawnCards(gameId: string): Promise<string[]> {
    const rows = await this.prisma.loto_Draw.findMany({ where: { gameId }, orderBy: { order: 'asc' } });
    return rows.map((row) => row.cardId);
  }

  async recordClaim(input: {
    gameId: string;
    teamId: string;
    atDraw: number;
    valid: boolean;
  }): Promise<void> {
    await this.prisma.loto_Claim.create({ data: { id: newId(), ...input } });
  }
}
```

Note d implémentation : `findFirst` plutôt que `findUnique`, comme dans le dépôt des jeux de cartes. L extension de cloisonnement du noyau injecte le locataire dans le `where`, et `findUnique` sur une clé composite ne lui laisse pas la place de le faire. Ne jamais écrire `tenantId` à la main dans une requête de module.

Le `catch` de `appendDraw` avale volontairement toutes les erreurs, ce qui est trop large. Il est resserré à la tâche 21, quand le cas d usage du tirage a de quoi distinguer une collision d unicité d une panne de base.

- [ ] **Étape 4 : lancer le test et vérifier qu il passe**

Lancer : `pnpm --filter @quetzal/module-loto test:integration`
Attendu : `Tests 15 passed`, soit les six du dépôt des jeux de cartes et les neuf nouveaux.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/infrastructure/prisma-game.repository.integration.spec.ts
git commit -m "test(module-loto): dépôt des parties contre un vrai Postgres

Couvre le cloisonnement entre locataires, l unicité du tirage d une carte et
le retypage des colonnes contraintes par CHECK."
git add packages/module-loto/src/infrastructure/prisma-game.repository.ts
git commit -m "feat(module-loto): dépôt Prisma des parties"
```
