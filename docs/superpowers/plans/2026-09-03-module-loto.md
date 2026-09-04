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
├── tsconfig.typecheck.json               inclut les specs, que tsconfig.json exclut
├── vitest.config.ts
├── vitest.integration.config.ts
├── prisma/
│   └── models.prisma                     tables Loto_*
├── scripts/
│   └── seed-loto.ts                      active le module et pose le jeu traditionnel
├── src/
│   ├── index.ts                          exporte manifest et LotoModule
│   ├── client.ts                         clientManifest, entrée navigateur
│   ├── manifest.ts                       manifeste serveur
│   ├── loto.module.ts                    module NestJS
│   ├── domain/                           pur, zéro dépendance framework
│   │   ├── errors.ts                     erreurs de domaine typées
│   │   ├── pattern.ts                    les quatre figures, prédicats purs
│   │   ├── tabla.ts                      génération, unicité, projection en grille
│   │   ├── drawn-cards.ts                brand DrawnCardId, seule fabrique légitime
│   │   ├── claim.ts                      validation d'une réclamation
│   │   ├── penalty.ts                    blocage après fausse réclamation
│   │   ├── game-status.ts                machine à états et actions permises
│   │   ├── team-assignment.ts            répartition en équipes
│   │   ├── team-name.ts                  nom dérivé d'une équipe
│   │   ├── join-code.ts                  génération du code court
│   │   └── ports/
│   │       ├── deck.repository.ts
│   │       ├── game.repository.ts
│   │       └── card-image.store.ts
│   ├── application/                      cas d'usage
│   │   ├── create-game.use-case.ts
│   │   ├── open-game.use-case.ts
│   │   ├── join-game.use-case.ts
│   │   ├── draw-card.use-case.ts
│   │   ├── toggle-mark.use-case.ts
│   │   ├── claim.use-case.ts
│   │   ├── finish-game.use-case.ts
│   │   ├── game-snapshot.use-case.ts     charge utile de l'événement state
│   │   ├── list-games.use-case.ts
│   │   ├── manage-decks.use-case.ts
│   │   └── testing/
│   │       └── fake-repositories.ts      factories manuelles, jamais vi.mock
│   ├── infrastructure/
│   │   ├── traditional-deck.ts           les 54 cartes livrées
│   │   ├── prisma-deck.repository.ts
│   │   ├── prisma-game.repository.ts
│   │   └── prisma-card-image.store.ts
│   ├── presentation/
│   │   ├── deck.controller.ts
│   │   ├── game.controller.ts
│   │   ├── image.controller.ts
│   │   ├── loto.gateway.ts               identité posée au handshake, jamais par message
│   │   ├── loto.broadcaster.ts           diffusion aux salles
│   │   ├── dto/loto.dto.ts               schémas Zod des entrées
│   │   └── ui/
│   │       ├── decks-page.tsx            jeux de cartes, création et historique
│   │       ├── deck-editor.tsx
│   │       ├── animator-page.tsx
│   │       ├── guest-join.tsx            écran joueur, monté par la plateforme
│   │       ├── use-game-socket.ts        état temps réel partagé par les deux écrans
│   │       ├── resize-image.ts
│   │       └── components/
│   │           ├── tabla-grid.tsx
│   │           ├── card-face.tsx
│   │           └── draw-ribbon.tsx
│   └── i18n/{fr,en,es}.json
└── tests/
    ├── manifest.spec.ts                  runContractSuite
    └── events.spec.ts                    contrat des événements publiés

packages/core/src/events/loto.ts          types des événements publiés
packages/core/src/rooms.ts                rooms.subgroup, salon d'équipe
packages/core/src/client/socket.ts        query de souscription au handshake
apps/api/src/filters/global-exception.filter.ts   DomainError vers 400
e2e/tests/loto-guest.e2e.spec.ts          parcours invité complet
```

Chaque fichier du domaine a une seule responsabilité et se lit d'un coup. C'est voulu : c'est la couche la plus testée et celle où une erreur coûte le plus cher.

Quatre fichiers hors du module sont touchés, et chacun l'est pour une raison qui dépasse le Lotería : un type d'événement est un contrat public, un salon d'équipe ne doit pas être une chaîne écrite à la main, un utilisateur authentifié doit pouvoir dire ce qu'il regarde, et une règle métier violée est une requête invalide plutôt qu'une panne. Si l'un d'eux se met à porter quelque chose de spécifique au Lotería, c'est que la frontière a bougé au mauvais endroit.

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

**Aucune colonne de ce module n est en `@db.Uuid`, y compris les identifiants que le module génère lui-même.** C est une divergence assumée avec `Hello_Greeting.id`, et CLAUDE.md paragraphe 9 autoriserait pourtant `@db.Uuid` ici. Deux raisons de ne pas le faire. D abord `Loto_Card.imageId` et `Loto_GameCard.imageId` contiennent une **empreinte sha256**, pas un UUID : la conversion serait fausse pour ces colonnes, et une règle qui souffre des exceptions dans le même fichier se perd à la première relecture. Ensuite le gain est nul au volume visé, tandis que le coût d une erreur est exactement le P2023 qui a cassé la production le 03/09. Ne pas « corriger » ce point sans une raison nouvelle.

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

- [ ] **Étape 4 bis : reconstruire @quetzal/db, sans quoi le cloisonnement ne s applique pas**

Lancer : `pnpm --filter @quetzal/db build`
Attendu : le registre `src/model-tenant-registry.ts` (généré, gitignoré) contient désormais les neuf modèles `loto_*`.

Ce n est pas une formalité. Le registre dit à l extension de cloisonnement quels modèles portent un `tenantId`. Tant qu il est périmé, les tables du module y sont absentes — et depuis le correctif du 04/09, toute requête sur l une d elles lève `UnknownTenantModelError` au lieu de partir sans filtre. Avant ce correctif, elle partait sans filtre : une lecture rendait les lignes de tous les locataires sans rien signaler.

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
Attendu : `Tests 32 passed` sur les deux fichiers réunis, soit vingt-huit existants (dix-sept pour les figures, onze pour les états) et quatre nouveaux.

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
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  loto_GameCard: {
    createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }>;
    findMany(args: { where: Record<string, unknown>; orderBy: Record<string, unknown> }): Promise<DeckCard[]>;
  };
  loto_Team: {
    create(args: { data: Record<string, unknown> }): Promise<TeamRow>;
    findMany(args: { where: Record<string, unknown>; orderBy: Record<string, unknown> }): Promise<TeamRow[]>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
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
    await this.prisma.loto_Game.updateMany({ where: { id: gameId }, data });
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
    await this.prisma.loto_Team.updateMany({ where: { id: teamId }, data: { markedCardIds } });
  }

  async blockTeam(teamId: string, untilDraw: number): Promise<void> {
    await this.prisma.loto_Team.updateMany({ where: { id: teamId }, data: { blockedUntilDraw: untilDraw } });
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

**Règle des clés composites, payée à la tâche 14 : sur un modèle de module, jamais `findUnique`, `update` ni `delete`.** Prisma exige pour ces trois-là le sélecteur composé `{ id_tenantId: { id, tenantId } }`, alors que l extension de cloisonnement du noyau injecte `tenantId` à plat dans le `where`. Les deux ne se rencontrent jamais. Employer `findFirst`, `updateMany` et `deleteMany`, dont le `where` est un filtre ordinaire que l extension sait compléter.

Et ne jamais écrire `tenantId` à la main dans une requête de module : c est l extension qui le pose, et le lui retirer des mains est l anti-pattern de CLAUDE.md paragraphe 14.

Le `catch` de `appendDraw` avale volontairement toutes les erreurs, ce qui est trop large. Il est resserré à la tâche 21, quand le cas d usage du tirage a de quoi distinguer une collision d unicité d une panne de base.

- [ ] **Étape 4 : lancer le test et vérifier qu il passe**

Lancer : `pnpm --filter @quetzal/module-loto test:integration`
Attendu : `Tests 17 passed`, soit les six du dépôt des jeux de cartes et les onze nouveaux.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/infrastructure/prisma-game.repository.integration.spec.ts
git commit -m "test(module-loto): dépôt des parties contre un vrai Postgres

Couvre le cloisonnement entre locataires, l unicité du tirage d une carte et
le retypage des colonnes contraintes par CHECK."
git add packages/module-loto/src/infrastructure/prisma-game.repository.ts
git commit -m "feat(module-loto): dépôt Prisma des parties"
```

### Tâche 18 : Types des événements publiés

Contrat public du module vers le reste de la plateforme. Il vit dans le noyau, pas dans le module : un abonné ne doit jamais importer `@quetzal/module-loto` pour typer ce qu il reçoit. CLAUDE.md paragraphe 3.

**Fichiers :**
- Créer : `packages/core/src/events/loto.ts`
- Test : `packages/module-loto/tests/events.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import {
  LotoGameStartedEvent,
  LotoCardDrawnEvent,
  LotoClaimRejectedEvent,
  LotoGameFinishedEvent,
} from '@quetzal/core/events/loto';

describe('contrat des événements loto', () => {
  it('expose les quatre noms de type annoncés par le manifeste', () => {
    expect(LotoGameStartedEvent).toBe('LotoGameStartedEvent');
    expect(LotoCardDrawnEvent).toBe('LotoCardDrawnEvent');
    expect(LotoClaimRejectedEvent).toBe('LotoClaimRejectedEvent');
    expect(LotoGameFinishedEvent).toBe('LotoGameFinishedEvent');
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run tests/events.spec.ts`
Attendu : ÉCHEC, `Cannot find module '@quetzal/core/events/loto'`.

- [ ] **Étape 3 : écrire l implémentation minimale**

`packages/core/src/events/loto.ts`, calqué sur `events/hello.ts` :

```ts
export interface LotoGameStartedEvent {
  gameId: string;
  tenantId: string;
  deckId: string;
  pattern: string;
  teamCount: number;
}

export interface LotoCardDrawnEvent {
  gameId: string;
  tenantId: string;
  order: number;
  cardId: string;
  label: string;
}

export interface LotoClaimRejectedEvent {
  gameId: string;
  tenantId: string;
  teamId: string;
  atDraw: number;
  blockedUntilDraw: number;
}

export interface LotoGameFinishedEvent {
  gameId: string;
  tenantId: string;
  wonByTeamId: string | null;
  pattern: string;
  drawCount: number;
}

export const LotoGameStartedEvent = 'LotoGameStartedEvent' as const;
export const LotoCardDrawnEvent = 'LotoCardDrawnEvent' as const;
export const LotoClaimRejectedEvent = 'LotoClaimRejectedEvent' as const;
export const LotoGameFinishedEvent = 'LotoGameFinishedEvent' as const;
```

`pattern` est typé `string` et non `PatternKey` : le contrat d événement est consommé par des abonnés qui n ont aucune raison de dépendre du domaine du Lotería. C est la même raison qui met ce fichier dans le noyau.

- [ ] **Étape 4 : reconstruire le noyau et lancer le test**

Lancer : `pnpm --filter @quetzal/core build && pnpm --filter @quetzal/module-loto exec vitest run tests/events.spec.ts`
Attendu : `Tests 1 passed`.

Le `build` est nécessaire : `@quetzal/core/events/*` pointe sur `dist`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/tests/events.spec.ts
git commit -m "test(module-loto): contrat des événements publiés"
git add packages/core/src/events/loto.ts
git commit -m "feat(core): types des événements du Lotería

Dans le noyau et non dans le module : un abonné ne doit jamais importer
@quetzal/module-loto pour typer ce qu il reçoit."
```

### Tâche 19 : Erreurs des cas d usage

Cinq erreurs typées que les cas d usage des tâches suivantes lèvent. Groupées ici pour que chaque cas d usage arrive avec son vocabulaire d échec déjà prêt.

**Fichiers :**
- Modifier : `packages/module-loto/src/domain/errors.ts`
- Test : `packages/module-loto/src/domain/errors.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

Ajouter un `describe` à la fin de `errors.spec.ts`, sans toucher aux trois existants :

```ts
describe('erreurs des cas d usage', () => {
  it('héritent toutes de DomainError du noyau', () => {
    expect(new DeckNotFoundError('d-1')).toBeInstanceOf(DomainError);
    expect(new GameNotFoundError('g-1')).toBeInstanceOf(DomainError);
    expect(new JoinCodeUnavailableError(20)).toBeInstanceOf(DomainError);
    expect(new NoCardsLeftError('g-1')).toBeInstanceOf(DomainError);
    expect(new DeckLockedError('d-1')).toBeInstanceOf(DomainError);
  });

  it('portent leur nom de classe', () => {
    expect(new DeckLockedError('d-1').name).toBe('DeckLockedError');
  });

  it('donnent le contexte utile dans le message', () => {
    expect(new DeckNotFoundError('d-1').message).toContain('d-1');
    expect(new GameNotFoundError('g-1').message).toContain('g-1');
    expect(new JoinCodeUnavailableError(20).message).toContain('20');
    expect(new NoCardsLeftError('g-1').message).toContain('g-1');
    expect(new DeckLockedError('d-1').message).toContain('d-1');
  });
});
```

Et l import en tête du fichier reçoit les cinq nouveaux noms :

```ts
import {
  DeckTooSmallError,
  InvalidGameTransitionError,
  TeamBlockedError,
  GameNotRunningError,
  InvalidTeamLimitError,
  TablaGenerationExhaustedError,
  DeckNotFoundError,
  GameNotFoundError,
  JoinCodeUnavailableError,
  NoCardsLeftError,
  DeckLockedError,
} from './errors.js';
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/errors.spec.ts`
Attendu : ÉCHEC, `DeckNotFoundError is not a constructor`.

- [ ] **Étape 3 : écrire l implémentation minimale**

À ajouter à la fin de `errors.ts` :

```ts
export class DeckNotFoundError extends DomainError {
  constructor(deckId: string) {
    super(`Jeu de cartes introuvable : ${deckId}`);
  }
}

export class GameNotFoundError extends DomainError {
  constructor(gameId: string) {
    super(`Partie introuvable : ${gameId}`);
  }
}

export class JoinCodeUnavailableError extends DomainError {
  constructor(attempts: number) {
    super(`Aucun code d entrée libre trouvé en ${attempts} tentatives`);
  }
}

export class NoCardsLeftError extends DomainError {
  constructor(gameId: string) {
    super(`Toutes les cartes ont été tirées dans la partie ${gameId}`);
  }
}

export class DeckLockedError extends DomainError {
  constructor(deckId: string) {
    super(`Jeu de cartes ${deckId} verrouillé : une partie en cours l utilise`);
  }
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/errors.spec.ts`
Attendu : `Tests 6 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/domain/errors.spec.ts
git commit -m "test(module-loto): erreurs des cas d usage"
git add packages/module-loto/src/domain/errors.ts
git commit -m "feat(module-loto): cinq erreurs typées pour la couche application"
```

### Tâche 20 : Cas d usage — créer une partie

**Fichiers :**
- Créer : `packages/module-loto/src/application/create-game.use-case.ts`
- Test : `packages/module-loto/src/application/create-game.use-case.spec.ts`
- Créer : `packages/module-loto/src/application/testing/fake-repositories.ts`

La fabrique de dépôts factices est écrite ici et réutilisée par tous les cas d usage suivants. CLAUDE.md paragraphe 11 : factories manuelles, jamais `vi.mock`.

- [ ] **Étape 1 : écrire les dépôts factices**

`src/application/testing/fake-repositories.ts` :

```ts
import type {
  Deck,
  DeckCard,
  DeckRepository,
  DeckSummary,
  NewDeckCard,
} from '../../domain/ports/deck.repository.js';
import type {
  GameRepository,
  GameSettings,
  GameState,
  TeamState,
} from '../../domain/ports/game.repository.js';
import type { GameStatus } from '../../domain/game-status.js';

let counter = 0;
// `-gen-` sépare les identifiants engendrés des identifiants d amorçage écrits
// à la main : sans lui, le premier `create` d un fichier de test rend `deck-1`,
// qui est aussi l identifiant par défaut de `deckOf`, et la copie écrase
// l original dans la Map sans que rien ne le signale.
const nextId = (prefix: string): string => `${prefix}-gen-${++counter}`;

export function deckOf(cardCount: number, overrides: Partial<Deck> = {}): Deck {
  const cards: DeckCard[] = Array.from({ length: cardCount }, (_, i) => ({
    id: `card-${i + 1}`,
    rank: i + 1,
    label: `Carta ${i + 1}`,
    imageId: null,
  }));
  return {
    id: 'deck-1',
    name: 'Jeu de test',
    isTemplate: false,
    cardCount,
    cards,
    ...overrides,
  };
}

export class FakeDeckRepository implements DeckRepository {
  readonly decks = new Map<string, Deck>();
  readonly unfinished = new Set<string>();

  add(deck: Deck): Deck {
    this.decks.set(deck.id, deck);
    return deck;
  }

  async list(): Promise<DeckSummary[]> {
    return [...this.decks.values()].map(({ id, name, isTemplate, cardCount }) => ({
      id,
      name,
      isTemplate,
      cardCount,
    }));
  }

  async findById(deckId: string): Promise<Deck | null> {
    const deck = this.decks.get(deckId);
    if (deck === undefined) return null;
    // Le dépôt Prisma trie par rang. Un faux qui rend l ordre d insertion
    // ferait passer des tests que la vraie implémentation ferait échouer.
    return { ...deck, cards: [...deck.cards].sort((a, b) => a.rank - b.rank) };
  }

  async create(input: {
    name: string;
    isTemplate: boolean;
    createdBy: string;
    cards: NewDeckCard[];
  }): Promise<Deck> {
    const deck: Deck = {
      id: nextId('deck'),
      name: input.name,
      isTemplate: input.isTemplate,
      cardCount: input.cards.length,
      cards: input.cards.map((card, i) => ({ id: nextId('card'), ...card, rank: card.rank || i + 1 })),
    };
    this.decks.set(deck.id, deck);
    return deck;
  }

  async rename(deckId: string, name: string): Promise<void> {
    const deck = this.decks.get(deckId);
    if (deck !== undefined) this.decks.set(deckId, { ...deck, name });
  }

  async updateCard(
    deckId: string,
    rank: number,
    patch: { label?: string; imageId?: string | null },
  ): Promise<void> {
    const deck = this.decks.get(deckId);
    if (deck === undefined) return;
    this.decks.set(deckId, {
      ...deck,
      cards: deck.cards.map((card) => (card.rank === rank ? { ...card, ...patch } : card)),
    });
  }

  async delete(deckId: string): Promise<void> {
    this.decks.delete(deckId);
  }

  async hasUnfinishedGame(deckId: string): Promise<boolean> {
    return this.unfinished.has(deckId);
  }
}

export class FakeGameRepository implements GameRepository {
  readonly games = new Map<string, GameState>();
  readonly frozen = new Map<string, DeckCard[]>();
  readonly teamsByGame = new Map<string, TeamState[]>();
  readonly members = new Map<string, { gameId: string; teamId: string; displayName: string }>();
  readonly draws = new Map<string, { order: number; cardId: string }[]>();
  readonly claims: { gameId: string; teamId: string; atDraw: number; valid: boolean }[] = [];

  async create(input: {
    deckId: string;
    createdBy: string;
    joinCode: string;
    settings: GameSettings;
  }): Promise<GameState> {
    const game: GameState = {
      id: nextId('game'),
      deckId: input.deckId,
      status: 'draft',
      joinCode: input.joinCode,
      settings: input.settings,
      lastDrawOrder: 0,
      wonByTeamId: null,
    };
    this.games.set(game.id, game);
    return game;
  }

  async findById(gameId: string): Promise<GameState | null> {
    const game = this.games.get(gameId);
    if (game === undefined) return null;
    // Le rang du dernier tirage, pas leur nombre. Les deux coïncident tant que
    // les rangs se suivent sans trou, ce que rien n impose au port.
    const orders = (this.draws.get(gameId) ?? []).map((draw) => draw.order);
    return { ...game, lastDrawOrder: orders.length === 0 ? 0 : Math.max(...orders) };
  }

  async findByJoinCode(joinCode: string): Promise<GameState | null> {
    for (const game of this.games.values()) {
      if (game.joinCode === joinCode) return game;
    }
    return null;
  }

  async setStatus(gameId: string, status: GameStatus, patch?: { wonByTeamId?: string }): Promise<void> {
    const game = this.games.get(gameId);
    if (game === undefined) return;
    this.games.set(gameId, {
      ...game,
      status,
      wonByTeamId: patch?.wonByTeamId ?? game.wonByTeamId,
    });
  }

  async freezeCards(gameId: string, cards: NewDeckCard[]): Promise<void> {
    this.frozen.set(
      gameId,
      cards.map((card, i) => ({ id: `frozen-${i + 1}`, ...card })),
    );
  }

  async frozenCards(gameId: string): Promise<DeckCard[]> {
    return this.frozen.get(gameId) ?? [];
  }

  async teams(gameId: string): Promise<TeamState[]> {
    return [...(this.teamsByGame.get(gameId) ?? [])].sort((a, b) => a.teamIndex - b.teamIndex);
  }

  async createTeam(gameId: string, input: { teamIndex: number; cardIds: string[] }): Promise<TeamState> {
    const team: TeamState = {
      id: nextId('team'),
      teamIndex: input.teamIndex,
      memberDisplayNames: [],
      cardIds: input.cardIds,
      markedCardIds: [],
      blockedUntilDraw: 0,
    };
    this.teamsByGame.set(gameId, [...(this.teamsByGame.get(gameId) ?? []), team]);
    return team;
  }

  private patchTeam(teamId: string, patch: Partial<TeamState>): void {
    for (const [gameId, teams] of this.teamsByGame) {
      this.teamsByGame.set(
        gameId,
        teams.map((team) => (team.id === teamId ? { ...team, ...patch } : team)),
      );
    }
  }

  async setMarks(teamId: string, markedCardIds: string[]): Promise<void> {
    this.patchTeam(teamId, { markedCardIds });
  }

  async blockTeam(teamId: string, untilDraw: number): Promise<void> {
    this.patchTeam(teamId, { blockedUntilDraw: untilDraw });
  }

  async findMember(gameId: string, guestId: string): Promise<{ teamId: string } | null> {
    const member = this.members.get(`${gameId}:${guestId}`);
    return member === undefined ? null : { teamId: member.teamId };
  }

  async addMember(input: {
    gameId: string;
    teamId: string;
    guestId: string;
    displayName: string;
  }): Promise<void> {
    this.members.set(`${input.gameId}:${input.guestId}`, {
      gameId: input.gameId,
      teamId: input.teamId,
      displayName: input.displayName,
    });
    for (const [gameId, teams] of this.teamsByGame) {
      this.teamsByGame.set(
        gameId,
        teams.map((team) =>
          team.id === input.teamId
            ? { ...team, memberDisplayNames: [...team.memberDisplayNames, input.displayName] }
            : team,
        ),
      );
    }
  }

  /**
   * Arme un échec d insertion pour le prochain tirage. C est la seule façon de
   * reproduire en mémoire une course entre deux appuis simultanés : en base,
   * c est une contrainte d unicité qui tranche, et le perdant reçoit false.
   */
  failNextAppendDraw = false;

  async appendDraw(gameId: string, order: number, cardId: string): Promise<boolean> {
    if (this.failNextAppendDraw) {
      this.failNextAppendDraw = false;
      return false;
    }
    const existing = this.draws.get(gameId) ?? [];
    if (existing.some((draw) => draw.order === order || draw.cardId === cardId)) return false;
    this.draws.set(gameId, [...existing, { order, cardId }]);
    return true;
  }

  async drawnCards(gameId: string): Promise<string[]> {
    return (this.draws.get(gameId) ?? []).map((draw) => draw.cardId);
  }

  async recordClaim(input: {
    gameId: string;
    teamId: string;
    atDraw: number;
    valid: boolean;
  }): Promise<void> {
    this.claims.push(input);
  }
}

export class RecordingEventBus {
  readonly emitted: { name: string; payload: unknown }[] = [];

  async emit<T = unknown>(name: string, payload: T): Promise<void> {
    this.emitted.push({ name, payload });
  }

  on(): void {
    // Aucun abonné dans les tests de cas d usage.
  }

  names(): string[] {
    return this.emitted.map((event) => event.name);
  }
}
```

- [ ] **Étape 2 : écrire le test qui échoue**

`src/application/create-game.use-case.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import type { EventBus } from '@quetzal/core';
import {
  DeckNotFoundError,
  DeckTooSmallError,
  InvalidTeamLimitError,
  JoinCodeUnavailableError,
} from '../domain/errors.js';
import { JOIN_CODE_LENGTH } from '../domain/join-code.js';
import { CreateGameUseCase } from './create-game.use-case.js';
import { FakeDeckRepository, FakeGameRepository, RecordingEventBus, deckOf } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

function build(random: () => number = Math.random) {
  const decks = new FakeDeckRepository();
  const games = new FakeGameRepository();
  const bus = new RecordingEventBus();
  const useCase = new CreateGameUseCase(decks, games, bus as unknown as EventBus, random);
  return { decks, games, bus, useCase };
}

describe('CreateGameUseCase', () => {
  it('crée une partie à l état draft avec un code d entrée', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54));

    const game = await useCase.execute({ deckId: 'deck-1', createdBy: 'u-1', settings: { ...SETTINGS } });

    expect(game.status).toBe('draft');
    expect(game.joinCode).toHaveLength(JOIN_CODE_LENGTH);
    expect(game.settings.maxTeams).toBe(6);
  });

  it('refuse un jeu de cartes inconnu', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ deckId: 'absent', createdBy: 'u-1', settings: { ...SETTINGS } }),
    ).rejects.toBeInstanceOf(DeckNotFoundError);
  });

  it('refuse un jeu de moins de seize cartes', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(15));
    await expect(
      useCase.execute({ deckId: 'deck-1', createdBy: 'u-1', settings: { ...SETTINGS } }),
    ).rejects.toBeInstanceOf(DeckTooSmallError);
  });

  it('refuse un maximum d équipes inférieur à un', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54));
    await expect(
      useCase.execute({ deckId: 'deck-1', createdBy: 'u-1', settings: { ...SETTINGS, maxTeams: 0 } }),
    ).rejects.toBeInstanceOf(InvalidTeamLimitError);
  });

  it('retente quand le code d entrée est déjà pris', async () => {
    const codes = ['AAA222', 'AAA222', 'BBB333'];
    let call = 0;
    const { decks, games, useCase } = build();
    decks.add(deckOf(54));
    await games.create({ deckId: 'deck-1', createdBy: 'u-1', joinCode: 'AAA222', settings: { ...SETTINGS } });

    const withFixedCodes = new CreateGameUseCase(
      decks,
      games,
      new RecordingEventBus() as unknown as EventBus,
      Math.random,
      () => codes[call++ % codes.length]!,
    );

    const game = await withFixedCodes.execute({
      deckId: 'deck-1',
      createdBy: 'u-1',
      settings: { ...SETTINGS },
    });
    expect(game.joinCode).toBe('BBB333');
  });

  it('abandonne après un nombre borné de codes déjà pris', async () => {
    const { decks, games, useCase } = build();
    decks.add(deckOf(54));
    await games.create({ deckId: 'deck-1', createdBy: 'u-1', joinCode: 'AAA222', settings: { ...SETTINGS } });

    const alwaysTaken = new CreateGameUseCase(
      decks,
      games,
      new RecordingEventBus() as unknown as EventBus,
      Math.random,
      () => 'AAA222',
    );

    await expect(
      alwaysTaken.execute({ deckId: 'deck-1', createdBy: 'u-1', settings: { ...SETTINGS } }),
    ).rejects.toBeInstanceOf(JoinCodeUnavailableError);
  });

  it('ne publie aucun événement : rien n a encore commencé', async () => {
    const { decks, bus, useCase } = build();
    decks.add(deckOf(54));
    await useCase.execute({ deckId: 'deck-1', createdBy: 'u-1', settings: { ...SETTINGS } });
    expect(bus.names()).toEqual([]);
  });
});
```

- [ ] **Étape 3 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/create-game.use-case.spec.ts`
Attendu : ÉCHEC, `Cannot find module './create-game.use-case.js'`.

- [ ] **Étape 4 : écrire l implémentation minimale**

```ts
import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import {
  DeckNotFoundError,
  DeckTooSmallError,
  InvalidTeamLimitError,
  JoinCodeUnavailableError,
} from '../domain/errors.js';
import { generateJoinCode } from '../domain/join-code.js';
import { MIN_DECK_SIZE } from '../domain/tabla.js';
import type { DeckRepository } from '../domain/ports/deck.repository.js';
import type { GameRepository, GameSettings, GameState } from '../domain/ports/game.repository.js';

export const MAX_JOIN_CODE_ATTEMPTS = 20;

export interface CreateGameInput {
  deckId: string;
  createdBy: string;
  settings: GameSettings;
}

@Injectable()
export class CreateGameUseCase {
  constructor(
    private readonly decks: DeckRepository,
    private readonly games: GameRepository,
    private readonly eventBus: EventBus,
    private readonly random: () => number,
    private readonly makeJoinCode: () => string = () => generateJoinCode(this.random),
  ) {}

  async execute(input: CreateGameInput): Promise<GameState> {
    if (input.settings.maxTeams < 1) throw new InvalidTeamLimitError(input.settings.maxTeams);

    const deck = await this.decks.findById(input.deckId);
    if (deck === null) throw new DeckNotFoundError(input.deckId);
    if (deck.cards.length < MIN_DECK_SIZE) throw new DeckTooSmallError(deck.cards.length);

    const joinCode = await this.freeJoinCode();
    return this.games.create({
      deckId: deck.id,
      createdBy: input.createdBy,
      joinCode,
      settings: input.settings,
    });
  }

  private async freeJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
      const candidate = this.makeJoinCode();
      if ((await this.games.findByJoinCode(candidate)) === null) return candidate;
    }
    throw new JoinCodeUnavailableError(MAX_JOIN_CODE_ATTEMPTS);
  }
}
```

Le code d entrée est vérifié en base et non seulement tiré au hasard : sa contrainte d unicité est par locataire, et deux parties d une même classe se chevauchent souvent dans la journée.

- [ ] **Étape 5 : lancer le test et vérifier qu il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/create-game.use-case.spec.ts`
Attendu : `Tests 7 passed`.

- [ ] **Étape 6 : commit**

```bash
git add packages/module-loto/src/application/testing/fake-repositories.ts packages/module-loto/src/application/create-game.use-case.spec.ts
git commit -m "test(module-loto): création de partie et dépôts factices

Factories manuelles, jamais vi.mock (CLAUDE.md paragraphe 11). Réutilisées
par tous les cas d usage suivants."
git add packages/module-loto/src/application/create-game.use-case.ts
git commit -m "feat(module-loto): cas d usage de création de partie"
```

### Tâche 21 : Cas d usage — ouvrir la partie

Décision D5 : au démarrage, la partie copie les cartes dont elle a besoin. À partir de cet instant, l historique ne peut plus mentir et aucune carte ne peut disparaître sous une partie en cours.

**Fichiers :**
- Créer : `packages/module-loto/src/application/open-game.use-case.ts`
- Test : `packages/module-loto/src/application/open-game.use-case.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import type { EventBus } from '@quetzal/core';
import { DeckNotFoundError, GameNotFoundError, InvalidGameTransitionError } from '../domain/errors.js';
import { OpenGameUseCase } from './open-game.use-case.js';
import { FakeDeckRepository, FakeGameRepository, RecordingEventBus, deckOf } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

async function build() {
  const decks = new FakeDeckRepository();
  const games = new FakeGameRepository();
  const bus = new RecordingEventBus();
  decks.add(deckOf(54));
  const game = await games.create({
    deckId: 'deck-1',
    createdBy: 'u-1',
    joinCode: 'AAA222',
    settings: { ...SETTINGS },
  });
  const useCase = new OpenGameUseCase(decks, games, bus as unknown as EventBus);
  return { decks, games, bus, game, useCase };
}

describe('OpenGameUseCase', () => {
  it('fige les cartes du jeu et passe la partie à open', async () => {
    const { games, game, useCase } = await build();

    const opened = await useCase.execute({ gameId: game.id });

    expect(opened.status).toBe('open');
    expect(await games.frozenCards(game.id)).toHaveLength(54);
  });

  it('copie le libellé et le rang de chaque carte, pas une référence', async () => {
    const { decks, games, game, useCase } = await build();
    await useCase.execute({ gameId: game.id });

    await decks.updateCard('deck-1', 1, { label: 'Renommée après coup' });

    const frozen = await games.frozenCards(game.id);
    expect(frozen[0]?.label).toBe('Carta 1');
  });

  it('refuse une partie inconnue', async () => {
    const { useCase } = await build();
    await expect(useCase.execute({ gameId: 'absent' })).rejects.toBeInstanceOf(GameNotFoundError);
  });

  it('refuse de rouvrir une partie déjà ouverte', async () => {
    const { games, game, useCase } = await build();
    await useCase.execute({ gameId: game.id });
    await expect(useCase.execute({ gameId: game.id })).rejects.toBeInstanceOf(InvalidGameTransitionError);
    expect((await games.findById(game.id))?.status).toBe('open');
  });

  it('refuse quand le jeu de cartes a disparu entre-temps', async () => {
    const { decks, game, useCase } = await build();
    await decks.delete('deck-1');
    await expect(useCase.execute({ gameId: game.id })).rejects.toBeInstanceOf(DeckNotFoundError);
  });

  it('ne publie aucun événement : la partie n a pas encore commencé', async () => {
    const { bus, game, useCase } = await build();
    await useCase.execute({ gameId: game.id });
    expect(bus.names()).toEqual([]);
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/open-game.use-case.spec.ts`
Attendu : ÉCHEC, `Cannot find module './open-game.use-case.js'`.

- [ ] **Étape 3 : écrire l implémentation minimale**

```ts
import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { DeckNotFoundError, DeckTooSmallError, GameNotFoundError } from '../domain/errors.js';
import { assertTransition } from '../domain/game-status.js';
import { MIN_DECK_SIZE } from '../domain/tabla.js';
import type { DeckRepository } from '../domain/ports/deck.repository.js';
import type { GameRepository, GameState } from '../domain/ports/game.repository.js';

@Injectable()
export class OpenGameUseCase {
  constructor(
    private readonly decks: DeckRepository,
    private readonly games: GameRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(input: { gameId: string }): Promise<GameState> {
    const game = await this.games.findById(input.gameId);
    if (game === null) throw new GameNotFoundError(input.gameId);
    assertTransition(game.status, 'open');

    const deck = await this.decks.findById(game.deckId);
    if (deck === null) throw new DeckNotFoundError(game.deckId);
    if (deck.cards.length < MIN_DECK_SIZE) throw new DeckTooSmallError(deck.cards.length);

    await this.games.freezeCards(
      game.id,
      deck.cards.map((card) => ({ rank: card.rank, label: card.label, imageId: card.imageId })),
    );
    await this.games.setStatus(game.id, 'open');

    const reloaded = await this.games.findById(game.id);
    if (reloaded === null) throw new GameNotFoundError(game.id);
    return reloaded;
  }
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/open-game.use-case.spec.ts`
Attendu : `Tests 6 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/application/open-game.use-case.spec.ts
git commit -m "test(module-loto): ouverture de partie, le jeu est figé"
git add packages/module-loto/src/application/open-game.use-case.ts
git commit -m "feat(module-loto): cas d usage d ouverture de partie

Décision D5 : la partie copie les cartes dont elle a besoin. L historique ne
peut plus mentir et aucune carte ne disparaît sous une partie en cours."
```

### Tâche 22 : Cas d usage — rejoindre une partie

Décision D3 : le domaine ne connaît que des équipes, un joueur seul est une équipe d un. Point notable du contrat, section 8.3 de la spec : **il n existe pas de message d entrée**. L affectation se fait à la connexion, à partir de l identité que la plateforme a posée sur le socket au handshake, et elle est idempotente par identifiant d invité.

C est cette idempotence qui fait qu une reconnexion retrouve son équipe au lieu d en créer une seconde, et que l écran joueur n a jamais de fenêtre pendant laquelle il serait connecté sans tabla. Le wifi d établissement en dépend directement.

**Fichiers :**
- Créer : `packages/module-loto/src/application/join-game.use-case.ts`
- Test : `packages/module-loto/src/application/join-game.use-case.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { GameNotFoundError, GameNotRunningError } from '../domain/errors.js';
import { TABLA_SIZE } from '../domain/pattern.js';
import { JoinGameUseCase } from './join-game.use-case.js';
import { FakeGameRepository } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

async function build(overrides: { maxTeams?: number } = {}) {
  const games = new FakeGameRepository();
  const game = await games.create({
    deckId: 'deck-1',
    createdBy: 'u-1',
    joinCode: 'AAA222',
    settings: { ...SETTINGS, maxTeams: overrides.maxTeams ?? SETTINGS.maxTeams },
  });
  await games.freezeCards(
    game.id,
    Array.from({ length: 54 }, (_, i) => ({ rank: i + 1, label: `Carta ${i + 1}`, imageId: null })),
  );
  await games.setStatus(game.id, 'open');
  const useCase = new JoinGameUseCase(games, Math.random);
  return { games, game, useCase };
}

describe('JoinGameUseCase', () => {
  it('crée une équipe d un et lui donne une tabla de seize cartes', async () => {
    const { games, game, useCase } = await build();

    const result = await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });

    const teams = await games.teams(game.id);
    expect(teams).toHaveLength(1);
    expect(teams[0]?.id).toBe(result.teamId);
    expect(teams[0]?.cardIds).toHaveLength(TABLA_SIZE);
    expect(teams[0]?.memberDisplayNames).toEqual(['Ana']);
  });

  it('ne tire la tabla que parmi les cartes figées de la partie', async () => {
    const { games, game, useCase } = await build();
    await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });

    const frozenIds = (await games.frozenCards(game.id)).map((card) => card.id);
    const teams = await games.teams(game.id);
    for (const cardId of teams[0]!.cardIds) expect(frozenIds).toContain(cardId);
  });

  it('une reconnexion retrouve son équipe au lieu d en créer une seconde', async () => {
    const { games, game, useCase } = await build();

    const first = await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });
    const second = await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });

    expect(second.teamId).toBe(first.teamId);
    expect(second.created).toBe(false);
    expect(await games.teams(game.id)).toHaveLength(1);
  });

  it('une reconnexion fonctionne même une fois la partie commencée', async () => {
    const { games, game, useCase } = await build();
    const first = await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });
    await games.setStatus(game.id, 'running');

    const again = await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });
    expect(again.teamId).toBe(first.teamId);
  });

  it('chaque arrivant forme sa propre équipe tant qu il reste de la place', async () => {
    const { games, game, useCase } = await build({ maxTeams: 3 });

    await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });
    await useCase.execute({ gameId: game.id, guestId: 'g-2', displayName: 'Beto' });
    await useCase.execute({ gameId: game.id, guestId: 'g-3', displayName: 'Caro' });

    const teams = await games.teams(game.id);
    expect(teams).toHaveLength(3);
    expect(teams.map((t) => t.teamIndex)).toEqual([0, 1, 2]);
  });

  it('au-delà du maximum, l arrivant rejoint l équipe la moins remplie', async () => {
    const { games, game, useCase } = await build({ maxTeams: 2 });

    await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });
    await useCase.execute({ gameId: game.id, guestId: 'g-2', displayName: 'Beto' });
    const third = await useCase.execute({ gameId: game.id, guestId: 'g-3', displayName: 'Caro' });

    const teams = await games.teams(game.id);
    expect(teams).toHaveLength(2);
    expect(third.created).toBe(false);
    expect(teams[0]?.id).toBe(third.teamId);
    expect(teams[0]?.memberDisplayNames).toEqual(['Ana', 'Caro']);
  });

  it('donne des tablas différentes aux équipes d une même partie', async () => {
    const { games, game, useCase } = await build();
    await useCase.execute({ gameId: game.id, guestId: 'g-1', displayName: 'Ana' });
    await useCase.execute({ gameId: game.id, guestId: 'g-2', displayName: 'Beto' });

    const teams = await games.teams(game.id);
    expect(teams[0]?.cardIds).not.toEqual(teams[1]?.cardIds);
  });

  it('refuse une partie inconnue', async () => {
    const { useCase } = await build();
    await expect(
      useCase.execute({ gameId: 'absent', guestId: 'g-1', displayName: 'Ana' }),
    ).rejects.toBeInstanceOf(GameNotFoundError);
  });

  it('refuse un nouvel arrivant une fois la partie commencée', async () => {
    const { games, game, useCase } = await build();
    await games.setStatus(game.id, 'running');

    await expect(
      useCase.execute({ gameId: game.id, guestId: 'g-9', displayName: 'Retardataire' }),
    ).rejects.toBeInstanceOf(GameNotRunningError);
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/join-game.use-case.spec.ts`
Attendu : ÉCHEC, `Cannot find module './join-game.use-case.js'`.

- [ ] **Étape 3 : écrire l implémentation minimale**

```ts
import { Injectable } from '@nestjs/common';
import { GameNotFoundError, GameNotRunningError } from '../domain/errors.js';
import { canJoin } from '../domain/game-status.js';
import { assignTeam } from '../domain/team-assignment.js';
import { generateUniqueTabla } from '../domain/tabla.js';
import type { GameRepository } from '../domain/ports/game.repository.js';

export interface JoinGameResult {
  teamId: string;
  created: boolean;
}

@Injectable()
export class JoinGameUseCase {
  constructor(
    private readonly games: GameRepository,
    private readonly random: () => number,
  ) {}

  async execute(input: {
    gameId: string;
    guestId: string;
    displayName: string;
  }): Promise<JoinGameResult> {
    const game = await this.games.findById(input.gameId);
    if (game === null) throw new GameNotFoundError(input.gameId);

    // Idempotence AVANT le contrôle d état : une reconnexion doit aboutir même
    // une fois la partie commencée, sinon une coupure wifi exclut un élève.
    const existing = await this.games.findMember(input.gameId, input.guestId);
    if (existing !== null) return { teamId: existing.teamId, created: false };

    if (!canJoin(game.status)) throw new GameNotRunningError(game.status);

    const teams = await this.games.teams(game.id);
    const decision = assignTeam(
      teams.map((team) => ({ id: team.id, memberCount: team.memberDisplayNames.length })),
      game.settings.maxTeams,
    );

    let teamId: string;
    let created: boolean;
    if (decision.kind === 'existing') {
      teamId = decision.teamId;
      created = false;
    } else {
      const frozen = await this.games.frozenCards(game.id);
      const tabla = generateUniqueTabla(
        frozen.map((card) => card.id),
        teams.map((team) => team.cardIds),
        this.random,
      );
      const team = await this.games.createTeam(game.id, { teamIndex: teams.length, cardIds: tabla });
      teamId = team.id;
      created = true;
    }

    await this.games.addMember({
      gameId: game.id,
      teamId,
      guestId: input.guestId,
      displayName: input.displayName,
    });

    return { teamId, created };
  }
}
```

L ordre du contrôle d idempotence et du contrôle d état n est pas cosmétique. Le mettre après `canJoin` interdirait toute reconnexion pendant la partie, ce qui est exactement le cas que le wifi d établissement produit. Le test « une reconnexion fonctionne même une fois la partie commencée » est le filet qui empêche de réordonner ces deux blocs par inadvertance.

- [ ] **Étape 4 : lancer le test et vérifier qu il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/join-game.use-case.spec.ts`
Attendu : `Tests 9 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/application/join-game.use-case.spec.ts
git commit -m "test(module-loto): entrée en partie, dont la reconnexion"
git add packages/module-loto/src/application/join-game.use-case.ts
git commit -m "feat(module-loto): cas d usage d entrée en partie

Idempotent par identifiant d invité, contrôlé avant l état de la partie :
une coupure wifi ne doit jamais exclure un élève de sa propre équipe."
```

### Tâche 23 : Cas d usage — tirer une carte

Le cas d usage le plus délicat du module, pour une raison qui ne saute pas aux yeux : **le premier tirage porte deux effets qui ne se séparent pas**. Il enregistre la carte et fait basculer la partie de `open` à `running`.

Les dissocier produit une partie qui accumule des tirages en restant `open`. Or `canClaim` exige `running` : toute réclamation serait refusée. L écran animateur serait parfaitement normal, les cartes sortiraient une à une, et la partie serait ingagnable. C est le genre de défaut qu on ne diagnostique pas en classe.

Le port ne fournit pas de transaction. La parade est double : l ordre des opérations, et une réconciliation en tête de méthode qui répare une partie laissée dans cet état par un incident.

**Fichiers :**
- Créer : `packages/module-loto/src/application/draw-card.use-case.ts`
- Test : `packages/module-loto/src/application/draw-card.use-case.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import type { EventBus } from '@quetzal/core';
import { GameNotFoundError, GameNotRunningError, NoCardsLeftError } from '../domain/errors.js';
import { DrawCardUseCase } from './draw-card.use-case.js';
import { FakeGameRepository, RecordingEventBus } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

async function build(cardCount = 54) {
  const games = new FakeGameRepository();
  const bus = new RecordingEventBus();
  const game = await games.create({
    deckId: 'deck-1',
    createdBy: 'u-1',
    joinCode: 'AAA222',
    settings: { ...SETTINGS },
  });
  await games.freezeCards(
    game.id,
    Array.from({ length: cardCount }, (_, i) => ({ rank: i + 1, label: `Carta ${i + 1}`, imageId: null })),
  );
  await games.setStatus(game.id, 'open');
  const useCase = new DrawCardUseCase(games, bus as unknown as EventBus, Math.random);
  return { games, bus, game, useCase };
}

describe('DrawCardUseCase', () => {
  it('tire une carte du jeu figé et l enregistre au rang un', async () => {
    const { games, game, useCase } = await build();

    const result = await useCase.execute({ gameId: game.id });

    expect(result.drawn).toBe(true);
    if (!result.drawn) throw new Error('inatteignable');
    expect(result.order).toBe(1);

    const frozenIds = (await games.frozenCards(game.id)).map((card) => card.id);
    expect(frozenIds).toContain(result.card.id);
    expect(await games.drawnCards(game.id)).toEqual([result.card.id]);
  });

  it('le premier tirage fait basculer la partie en running', async () => {
    const { games, game, useCase } = await build();
    await useCase.execute({ gameId: game.id });
    expect((await games.findById(game.id))?.status).toBe('running');
  });

  it('publie game.started au premier tirage seulement, card.drawn à chaque fois', async () => {
    const { bus, game, useCase } = await build();

    await useCase.execute({ gameId: game.id });
    await useCase.execute({ gameId: game.id });

    expect(bus.names()).toEqual(['loto.game.started', 'loto.card.drawn', 'loto.card.drawn']);
  });

  it('ne tire jamais deux fois la même carte', async () => {
    const { games, game, useCase } = await build(20);

    for (let i = 0; i < 20; i++) await useCase.execute({ gameId: game.id });

    const drawn = await games.drawnCards(game.id);
    expect(drawn).toHaveLength(20);
    expect(new Set(drawn).size).toBe(20);
  });

  it('refuse de tirer quand toutes les cartes sont sorties', async () => {
    const { game, useCase } = await build(16);
    for (let i = 0; i < 16; i++) await useCase.execute({ gameId: game.id });

    await expect(useCase.execute({ gameId: game.id })).rejects.toBeInstanceOf(NoCardsLeftError);
  });

  it('un double appui simultané reste sans effet plutôt qu erroné', async () => {
    const { games, game, useCase } = await build();
    // En base, c est une contrainte d unicité de Loto_Draw qui tranche entre
    // deux appuis simultanés, et le perdant reçoit false. En mémoire, on arme
    // cet échec — pré-insérer un tirage ne le reproduirait pas, puisque le cas
    // d usage lirait alors un rang déjà avancé et son insertion réussirait.
    games.failNextAppendDraw = true;

    const result = await useCase.execute({ gameId: game.id });

    expect(result.drawn).toBe(false);
    expect(await games.drawnCards(game.id)).toHaveLength(0);
    // Une course perdue ne doit surtout pas faire basculer la partie.
    expect((await games.findById(game.id))?.status).toBe('open');
  });

  it('répare une partie laissée en open alors que des cartes sont déjà sorties', async () => {
    const { games, bus, game, useCase } = await build();
    const frozen = await games.frozenCards(game.id);
    await games.appendDraw(game.id, 1, frozen[0]!.id);
    // La partie est restée open : un incident a coupé entre le tirage et la
    // bascule. Sans réparation, canClaim refuse tout et la partie est ingagnable.
    expect((await games.findById(game.id))?.status).toBe('open');

    await useCase.execute({ gameId: game.id });

    expect((await games.findById(game.id))?.status).toBe('running');
    expect(bus.names()).toContain('loto.game.started');
  });

  it('refuse de tirer dans une partie en draft', async () => {
    const { games, game, useCase } = await build();
    await games.setStatus(game.id, 'draft');
    await expect(useCase.execute({ gameId: game.id })).rejects.toBeInstanceOf(GameNotRunningError);
  });

  it('refuse de tirer dans une partie terminée', async () => {
    const { games, game, useCase } = await build();
    await games.setStatus(game.id, 'finished');
    await expect(useCase.execute({ gameId: game.id })).rejects.toBeInstanceOf(GameNotRunningError);
  });

  it('refuse une partie inconnue', async () => {
    const { useCase } = await build();
    await expect(useCase.execute({ gameId: 'absent' })).rejects.toBeInstanceOf(GameNotFoundError);
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/draw-card.use-case.spec.ts`
Attendu : ÉCHEC, `Cannot find module './draw-card.use-case.js'`.

- [ ] **Étape 3 : écrire l implémentation minimale**

```ts
import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { GameNotFoundError, GameNotRunningError, NoCardsLeftError } from '../domain/errors.js';
import { canDraw } from '../domain/game-status.js';
import type { DeckCard } from '../domain/ports/deck.repository.js';
import type { GameRepository, GameState } from '../domain/ports/game.repository.js';

export type DrawResult = { drawn: false } | { drawn: true; order: number; card: DeckCard };

@Injectable()
export class DrawCardUseCase {
  constructor(
    private readonly games: GameRepository,
    private readonly eventBus: EventBus,
    private readonly random: () => number,
  ) {}

  async execute(input: { gameId: string }): Promise<DrawResult> {
    const found = await this.games.findById(input.gameId);
    if (found === null) throw new GameNotFoundError(input.gameId);
    if (!canDraw(found.status)) throw new GameNotRunningError(found.status);

    const drawnBefore = await this.games.drawnCards(found.id);
    const game = await this.reconcile(found, drawnBefore.length);

    const frozen = await this.games.frozenCards(game.id);
    const alreadyDrawn = new Set(drawnBefore);
    const remaining = frozen.filter((card) => !alreadyDrawn.has(card.id));
    if (remaining.length === 0) throw new NoCardsLeftError(game.id);

    const index = Math.floor(this.random() * remaining.length) % remaining.length;
    const card = remaining[index]!;
    const order = game.lastDrawOrder + 1;

    const inserted = await this.games.appendDraw(game.id, order, card.id);
    if (!inserted) return { drawn: false };

    await this.start(game, drawnBefore.length);

    await this.eventBus.emit('loto.card.drawn', {
      gameId: game.id,
      order,
      cardId: card.id,
      label: card.label,
    });
    return { drawn: true, order, card };
  }

  /**
   * Répare une partie restée en `open` alors que des cartes sont déjà sorties.
   * Le port n offre pas de transaction : un incident entre l insertion du
   * tirage et la bascule laisserait une partie ingagnable, puisque canClaim
   * exige `running`. Cette réconciliation referme cette fenêtre.
   */
  private async reconcile(game: GameState, drawCount: number): Promise<GameState> {
    if (game.status !== 'open' || drawCount === 0) return game;
    await this.startFrom(game);
    const reloaded = await this.games.findById(game.id);
    if (reloaded === null) throw new GameNotFoundError(game.id);
    return reloaded;
  }

  private async start(game: GameState, drawCountBefore: number): Promise<void> {
    if (game.status !== 'open' || drawCountBefore > 0) return;
    await this.startFrom(game);
  }

  private async startFrom(game: GameState): Promise<void> {
    await this.games.setStatus(game.id, 'running');
    const teams = await this.games.teams(game.id);
    await this.eventBus.emit('loto.game.started', {
      gameId: game.id,
      deckId: game.deckId,
      pattern: game.settings.pattern,
      teamCount: teams.length,
    });
  }
}
```

Le `tenantId` des charges utiles d événement est ajouté par la couche présentation, qui seule dispose du contexte de requête. Les cas d usage ne le connaissent pas : c est la même raison qui interdit à un module d écrire `tenantId` dans une requête Prisma.

- [ ] **Étape 4 : lancer le test et vérifier qu il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/draw-card.use-case.spec.ts`
Attendu : `Tests 10 passed`.

- [ ] **Étape 5 : resserrer le `catch` du dépôt**

Le dépôt Prisma de la tâche 17 avale toutes les erreurs dans `appendDraw`. Maintenant que le cas d usage distingue les deux issues, restreindre au seul cas voulu.

Remplacer le corps de `appendDraw` dans `prisma-game.repository.ts` :

```ts
  async appendDraw(gameId: string, order: number, cardId: string): Promise<boolean> {
    try {
      await this.prisma.loto_Draw.create({ data: { id: newId(), gameId, order, cardId } });
      return true;
    } catch (err) {
      // P2002 : violation d unicité. Les deux contraintes de Loto_Draw rendent
      // un double appui simultané sans effet plutôt qu erroné (spec 6.1).
      // Toute autre erreur est une vraie panne et doit remonter.
      if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
        return false;
      }
      throw err;
    }
  }
```

- [ ] **Étape 6 : relancer les tests d intégration**

Lancer : `pnpm --filter @quetzal/module-loto test:integration`
Attendu : `Tests 17 passed`. Le test « une carte ne sort qu une fois » couvre déjà le chemin P2002 contre un vrai Postgres.

- [ ] **Étape 7 : commit**

```bash
git add packages/module-loto/src/application/draw-card.use-case.spec.ts
git commit -m "test(module-loto): tirage, bascule en running et réparation"
git add packages/module-loto/src/application/draw-card.use-case.ts packages/module-loto/src/infrastructure/prisma-game.repository.ts
git commit -m "feat(module-loto): cas d usage de tirage

Le premier tirage enregistre la carte ET bascule la partie en running. Les
dissocier produirait une partie qui accumule des tirages en restant open,
donc ingagnable puisque canClaim exige running, avec un écran parfaitement
normal. Une réconciliation en tête de méthode répare ce cas s il survient.

Le catch de appendDraw est resserré à P2002 : une vraie panne doit remonter."
```

### Tâche 24 : Cas d usage — marquer une case

Décision D2 : le marquage est un état partagé sans autorité. Il est persisté et diffusé aux coéquipiers, parce qu une tabla d équipe doit être vue à l identique par tous et survivre à une coupure réseau. **Il ne participe jamais à une décision de jeu.**

Ce cas d usage est donc volontairement pauvre : il écrit et il diffuse, il ne décide rien. La tâche suivante, la réclamation, ne le lit pas.

**Fichiers :**
- Modifier : `packages/module-loto/src/domain/game-status.ts`
- Test : `packages/module-loto/src/domain/game-status.spec.ts`
- Modifier : `packages/module-loto/src/domain/errors.ts`
- Test : `packages/module-loto/src/domain/errors.spec.ts`
- Créer : `packages/module-loto/src/application/toggle-mark.use-case.ts`
- Test : `packages/module-loto/src/application/toggle-mark.use-case.spec.ts`

- [ ] **Étape 1 : écrire les tests de domaine qui échouent**

À ajouter dans `game-status.spec.ts`, dans le `describe('actions permises par état')` existant :

```ts
  it('on marque dans une partie ouverte ou en cours, jamais avant ni après', () => {
    expect(canMark('open')).toBe(true);
    expect(canMark('running')).toBe(true);
    expect(canMark('draft')).toBe(false);
    expect(canMark('finished')).toBe(false);
  });
```

Et `canMark` rejoint la liste d imports en tête du fichier.

À ajouter dans `errors.spec.ts`, dans le `describe('erreurs des cas d usage')` :

```ts
  it('couvre aussi la carte hors tabla et l équipe inconnue', () => {
    expect(new CardNotOnTablaError('c-9')).toBeInstanceOf(DomainError);
    expect(new TeamNotFoundError('t-9')).toBeInstanceOf(DomainError);
    expect(new CardNotOnTablaError('c-9').message).toContain('c-9');
    expect(new TeamNotFoundError('t-9').message).toContain('t-9');
  });
```

Et les deux noms rejoignent l import.

- [ ] **Étape 2 : lancer les tests et vérifier qu ils échouent**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/game-status.spec.ts src/domain/errors.spec.ts`
Attendu : ÉCHEC, `canMark is not a function` et `CardNotOnTablaError is not a constructor`.

- [ ] **Étape 3 : écrire l implémentation de domaine**

À ajouter dans `game-status.ts` :

```ts
/** Un élève peut marquer dès la salle d attente : c est sans effet, et sans risque. */
export function canMark(status: GameStatus): boolean {
  return status === 'open' || status === 'running';
}
```

À ajouter dans `errors.ts` :

```ts
export class CardNotOnTablaError extends DomainError {
  constructor(cardId: string) {
    super(`Carte ${cardId} absente de la tabla de l équipe`);
  }
}

export class TeamNotFoundError extends DomainError {
  constructor(teamId: string) {
    super(`Équipe introuvable : ${teamId}`);
  }
}
```

- [ ] **Étape 4 : lancer les tests de domaine et vérifier qu ils passent**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/domain/game-status.spec.ts src/domain/errors.spec.ts`
Attendu : `Tests 21 passed` sur les deux fichiers réunis.

- [ ] **Étape 5 : commit du domaine**

```bash
git add packages/module-loto/src/domain/game-status.spec.ts packages/module-loto/src/domain/errors.spec.ts
git commit -m "test(module-loto): canMark et deux erreurs de plus"
git add packages/module-loto/src/domain/game-status.ts packages/module-loto/src/domain/errors.ts
git commit -m "feat(module-loto): canMark, CardNotOnTablaError, TeamNotFoundError"
```

- [ ] **Étape 6 : écrire le test du cas d usage qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { CardNotOnTablaError, GameNotRunningError, TeamNotFoundError } from '../domain/errors.js';
import { ToggleMarkUseCase } from './toggle-mark.use-case.js';
import { FakeGameRepository } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

async function build() {
  const games = new FakeGameRepository();
  const game = await games.create({
    deckId: 'deck-1',
    createdBy: 'u-1',
    joinCode: 'AAA222',
    settings: { ...SETTINGS },
  });
  await games.setStatus(game.id, 'running');
  const team = await games.createTeam(game.id, { teamIndex: 0, cardIds: ['c1', 'c2', 'c3'] });
  const useCase = new ToggleMarkUseCase(games);
  return { games, game, team, useCase };
}

describe('ToggleMarkUseCase', () => {
  it('marque une case de la tabla', async () => {
    const { games, game, team, useCase } = await build();

    const result = await useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c2', marked: true });

    expect(result.marked).toBe(true);
    const teams = await games.teams(game.id);
    expect(teams[0]?.markedCardIds).toEqual(['c2']);
  });

  it('démarque une case déjà marquée', async () => {
    const { games, game, team, useCase } = await build();
    await useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c2', marked: true });

    await useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c2', marked: false });

    const teams = await games.teams(game.id);
    expect(teams[0]?.markedCardIds).toEqual([]);
  });

  it('marquer deux fois la même case ne la duplique pas', async () => {
    const { games, game, team, useCase } = await build();
    await useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c2', marked: true });
    await useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c2', marked: true });

    const teams = await games.teams(game.id);
    expect(teams[0]?.markedCardIds).toEqual(['c2']);
  });

  it('refuse une carte absente de la tabla de l équipe', async () => {
    const { game, team, useCase } = await build();
    await expect(
      useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c99', marked: true }),
    ).rejects.toBeInstanceOf(CardNotOnTablaError);
  });

  it('refuse une équipe inconnue', async () => {
    const { game, useCase } = await build();
    await expect(
      useCase.execute({ gameId: game.id, teamId: 'absent', cardId: 'c1', marked: true }),
    ).rejects.toBeInstanceOf(TeamNotFoundError);
  });

  it('refuse de marquer dans une partie terminée', async () => {
    const { games, game, team, useCase } = await build();
    await games.setStatus(game.id, 'finished');
    await expect(
      useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c1', marked: true }),
    ).rejects.toBeInstanceOf(GameNotRunningError);
  });

  it('ne touche jamais aux cartes de la tabla en écrivant un marquage', async () => {
    const { games, game, team, useCase } = await build();
    await useCase.execute({ gameId: game.id, teamId: team.id, cardId: 'c1', marked: true });

    const teams = await games.teams(game.id);
    expect(teams[0]?.cardIds).toEqual(['c1', 'c2', 'c3']);
  });
});
```

- [ ] **Étape 7 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/toggle-mark.use-case.spec.ts`
Attendu : ÉCHEC, `Cannot find module './toggle-mark.use-case.js'`.

- [ ] **Étape 8 : écrire l implémentation minimale**

```ts
import { Injectable } from '@nestjs/common';
import {
  CardNotOnTablaError,
  GameNotFoundError,
  GameNotRunningError,
  TeamNotFoundError,
} from '../domain/errors.js';
import { canMark } from '../domain/game-status.js';
import type { GameRepository } from '../domain/ports/game.repository.js';

export interface ToggleMarkResult {
  teamId: string;
  cardId: string;
  marked: boolean;
  markedCardIds: string[];
}

/**
 * Décision D2 : ce cas d usage écrit un état partagé sans autorité. Aucune
 * décision de jeu ne lit ce qu il écrit — la réclamation part des seuls
 * tirages du serveur. Ajouter ici une validation « la carte a-t-elle été
 * tirée » donnerait au marquage une autorité qu il ne doit pas avoir.
 */
@Injectable()
export class ToggleMarkUseCase {
  constructor(private readonly games: GameRepository) {}

  async execute(input: {
    gameId: string;
    teamId: string;
    cardId: string;
    marked: boolean;
  }): Promise<ToggleMarkResult> {
    const game = await this.games.findById(input.gameId);
    if (game === null) throw new GameNotFoundError(input.gameId);
    if (!canMark(game.status)) throw new GameNotRunningError(game.status);

    const teams = await this.games.teams(game.id);
    const team = teams.find((candidate) => candidate.id === input.teamId);
    if (team === undefined) throw new TeamNotFoundError(input.teamId);
    if (!team.cardIds.includes(input.cardId)) throw new CardNotOnTablaError(input.cardId);

    const without = team.markedCardIds.filter((cardId) => cardId !== input.cardId);
    const markedCardIds = input.marked ? [...without, input.cardId] : without;
    await this.games.setMarks(team.id, markedCardIds);

    return { teamId: team.id, cardId: input.cardId, marked: input.marked, markedCardIds };
  }
}
```

- [ ] **Étape 9 : lancer le test et vérifier qu il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/toggle-mark.use-case.spec.ts`
Attendu : `Tests 7 passed`.

- [ ] **Étape 10 : commit**

```bash
git add packages/module-loto/src/application/toggle-mark.use-case.spec.ts
git commit -m "test(module-loto): marquage partagé, sans autorité"
git add packages/module-loto/src/application/toggle-mark.use-case.ts
git commit -m "feat(module-loto): cas d usage de marquage

Écrit et diffuse, ne décide rien. Décision D2."
```

### Tâche 25 : Cas d usage — réclamer

Le cœur du module. C est ici, et nulle part ailleurs, que le cas adversarial de D1 peut enfin s écrire : une équipe dont le marquage dessine une figure parfaite alors que rien n a été tiré doit voir sa réclamation refusée et se faire pénaliser.

Le domaine ne peut pas porter ce test, puisqu il n accepte aucune entrée de marquage avec laquelle mentir. La couche application, elle, a les deux sous la main — et c est précisément pour cela que le brand `DrawnCardId` existe.

**Fichiers :**
- Créer : `packages/module-loto/src/application/claim.use-case.ts`
- Test : `packages/module-loto/src/application/claim.use-case.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import type { EventBus } from '@quetzal/core';
import {
  GameNotFoundError,
  GameNotRunningError,
  TeamBlockedError,
  TeamNotFoundError,
} from '../domain/errors.js';
import { ClaimUseCase } from './claim.use-case.js';
import { FakeGameRepository, RecordingEventBus } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;
const TABLA = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'];

async function build(penalty = 3) {
  const games = new FakeGameRepository();
  const bus = new RecordingEventBus();
  const game = await games.create({
    deckId: 'deck-1',
    createdBy: 'u-1',
    joinCode: 'AAA222',
    settings: { ...SETTINGS, falseClaimPenaltyDraws: penalty },
  });
  await games.freezeCards(
    game.id,
    TABLA.map((label, i) => ({ rank: i + 1, label, imageId: null })),
  );
  await games.setStatus(game.id, 'running');
  const team = await games.createTeam(game.id, { teamIndex: 0, cardIds: [...TABLA] });
  const useCase = new ClaimUseCase(games, bus as unknown as EventBus);
  return { games, bus, game, team, useCase };
}

/**
 * Enregistre des tirages réels, comme le ferait le cas d usage de tirage.
 * Le rang REPART du dernier enregistré, il ne recommence pas à un : le dépôt
 * refuse un rang déjà pris, donc un second appel perdrait silencieusement ses
 * cartes et l équipe resterait bloquée pour une raison étrangère au domaine.
 */
async function draw(games: FakeGameRepository, gameId: string, cardIds: string[]): Promise<void> {
  let order = (games.draws.get(gameId) ?? []).length;
  for (const cardId of cardIds) await games.appendDraw(gameId, ++order, cardId);
}

describe('ClaimUseCase', () => {
  it('valide une réclamation appuyée sur une ligne réellement tirée', async () => {
    const { games, bus, game, team, useCase } = await build();
    await draw(games, game.id, ['a', 'b', 'c', 'd']);

    const result = await useCase.execute({ gameId: game.id, teamId: team.id });

    expect(result.valid).toBe(true);
    const reloaded = await games.findById(game.id);
    expect(reloaded?.status).toBe('finished');
    expect(reloaded?.wonByTeamId).toBe(team.id);
    expect(bus.names()).toContain('loto.game.finished');
  });

  it('LE TEST QUI COMPTE : un marquage parfait sans aucun tirage ne gagne rien', async () => {
    const { games, game, team, useCase } = await build();
    // L équipe prétend avoir marqué une línea entière. Le serveur n a rien tiré.
    await games.setMarks(team.id, ['a', 'b', 'c', 'd']);

    const result = await useCase.execute({ gameId: game.id, teamId: team.id });

    expect(result.valid).toBe(false);
    const reloaded = await games.findById(game.id);
    expect(reloaded?.status).toBe('running');
    expect(reloaded?.wonByTeamId).toBeNull();
  });

  it('un marquage falsifié coûte la pénalité, comme n importe quelle fausse réclamation', async () => {
    const { games, game, team, useCase } = await build(3);
    await draw(games, game.id, ['a', 'b']);
    await games.setMarks(team.id, ['a', 'b', 'c', 'd']);

    const result = await useCase.execute({ gameId: game.id, teamId: team.id });

    expect(result.valid).toBe(false);
    expect(result.blockedUntilDraw).toBe(5);
    const teams = await games.teams(game.id);
    expect(teams[0]?.blockedUntilDraw).toBe(5);
  });

  it('publie claim.rejected sur une fausse réclamation', async () => {
    const { games, bus, game, team, useCase } = await build();
    await draw(games, game.id, ['a']);

    await useCase.execute({ gameId: game.id, teamId: team.id });

    expect(bus.names()).toEqual(['loto.claim.rejected']);
    expect(bus.names()).not.toContain('loto.game.finished');
  });

  it('enregistre chaque réclamation, valide ou non', async () => {
    const { games, game, team, useCase } = await build();
    await draw(games, game.id, ['a']);
    await useCase.execute({ gameId: game.id, teamId: team.id });

    expect(games.claims).toHaveLength(1);
    expect(games.claims[0]).toMatchObject({ teamId: team.id, atDraw: 1, valid: false });
  });

  it('refuse une réclamation tant que la pénalité court', async () => {
    const { games, game, team, useCase } = await build(3);
    await draw(games, game.id, ['a', 'b']);
    await useCase.execute({ gameId: game.id, teamId: team.id });

    await draw(games, game.id, ['c']);
    await expect(useCase.execute({ gameId: game.id, teamId: team.id })).rejects.toBeInstanceOf(TeamBlockedError);
  });

  it('libère l équipe au tirage de la borne', async () => {
    const { games, game, team, useCase } = await build(3);
    await draw(games, game.id, ['a', 'b']);
    await useCase.execute({ gameId: game.id, teamId: team.id });

    await draw(games, game.id, ['c', 'd', 'e']);
    const result = await useCase.execute({ gameId: game.id, teamId: team.id });
    expect(result.valid).toBe(true);
  });

  it('sans pénalité configurée, une fausse réclamation ne bloque rien', async () => {
    const { games, game, team, useCase } = await build(0);
    await draw(games, game.id, ['a']);

    const result = await useCase.execute({ gameId: game.id, teamId: team.id });
    expect(result.blockedUntilDraw).toBe(0);

    const again = await useCase.execute({ gameId: game.id, teamId: team.id });
    expect(again.valid).toBe(false);
  });

  it('refuse de réclamer dans une partie qui n est pas en cours', async () => {
    const { games, game, team, useCase } = await build();
    await games.setStatus(game.id, 'open');
    await expect(useCase.execute({ gameId: game.id, teamId: team.id })).rejects.toBeInstanceOf(GameNotRunningError);
  });

  it('refuse une équipe inconnue', async () => {
    const { game, useCase } = await build();
    await expect(useCase.execute({ gameId: game.id, teamId: 'absent' })).rejects.toBeInstanceOf(TeamNotFoundError);
  });

  it('refuse une partie inconnue', async () => {
    const { team, useCase } = await build();
    await expect(useCase.execute({ gameId: 'absent', teamId: team.id })).rejects.toBeInstanceOf(GameNotFoundError);
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/claim.use-case.spec.ts`
Attendu : ÉCHEC, `Cannot find module './claim.use-case.js'`.

- [ ] **Étape 3 : écrire l implémentation minimale**

```ts
import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { isWinningClaim } from '../domain/claim.js';
import { drawnCardIds } from '../domain/drawn-cards.js';
import { GameNotFoundError, GameNotRunningError, TeamBlockedError, TeamNotFoundError } from '../domain/errors.js';
import { canClaim } from '../domain/game-status.js';
import { blockUntil, isBlocked } from '../domain/penalty.js';
import type { GameRepository } from '../domain/ports/game.repository.js';

export interface ClaimResult {
  valid: boolean;
  atDraw: number;
  blockedUntilDraw: number;
}

@Injectable()
export class ClaimUseCase {
  constructor(
    private readonly games: GameRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(input: { gameId: string; teamId: string }): Promise<ClaimResult> {
    const game = await this.games.findById(input.gameId);
    if (game === null) throw new GameNotFoundError(input.gameId);
    if (!canClaim(game.status)) throw new GameNotRunningError(game.status);

    const teams = await this.games.teams(game.id);
    const team = teams.find((candidate) => candidate.id === input.teamId);
    if (team === undefined) throw new TeamNotFoundError(input.teamId);
    if (isBlocked(team.blockedUntilDraw, game.lastDrawOrder)) {
      throw new TeamBlockedError(team.blockedUntilDraw);
    }

    // Décision D1. `team.markedCardIds` est juste là, du même type, et n est
    // pas lu. Le brand DrawnCardId fait que le confondre avec ceci ne compile
    // pas : c est la seule protection structurelle de cet invariant.
    const drawn = drawnCardIds(await this.games.drawnCards(game.id));

    const valid = isWinningClaim({
      tablaCardIds: team.cardIds,
      drawnCardIds: drawn,
      pattern: game.settings.pattern,
    });

    await this.games.recordClaim({
      gameId: game.id,
      teamId: team.id,
      atDraw: game.lastDrawOrder,
      valid,
    });

    if (valid) {
      await this.games.setStatus(game.id, 'finished', { wonByTeamId: team.id });
      await this.eventBus.emit('loto.game.finished', {
        gameId: game.id,
        wonByTeamId: team.id,
        pattern: game.settings.pattern,
        drawCount: game.lastDrawOrder,
      });
      return { valid: true, atDraw: game.lastDrawOrder, blockedUntilDraw: team.blockedUntilDraw };
    }

    const blockedUntilDraw = blockUntil(game.lastDrawOrder, game.settings.falseClaimPenaltyDraws);
    await this.games.blockTeam(team.id, blockedUntilDraw);
    await this.eventBus.emit('loto.claim.rejected', {
      gameId: game.id,
      teamId: team.id,
      atDraw: game.lastDrawOrder,
      blockedUntilDraw,
    });
    return { valid: false, atDraw: game.lastDrawOrder, blockedUntilDraw };
  }
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/claim.use-case.spec.ts`
Attendu : `Tests 11 passed`.

- [ ] **Étape 5 : vérifier que le brand tient vraiment**

Ouvrir `claim.use-case.ts` et remplacer temporairement la ligne du tirage par la version catastrophique :

```ts
    const drawn = drawnCardIds(team.markedCardIds);
```

Lancer : `pnpm --filter @quetzal/module-loto typecheck`
Attendu : **aucune erreur**. Le brand n interdit pas cet appel, il le rend visible : la fabrique s appelle `drawnCardIds` et son paramètre s appelle `fromServerDraws`, donc la ligne se lit « les cartes tirées par le serveur sont le marquage du client », ce qui est absurde à la relecture.

Lancer ensuite : `pnpm --filter @quetzal/module-loto exec vitest run src/application/claim.use-case.spec.ts`
Attendu : **ÉCHEC** du test « LE TEST QUI COMPTE ». C est lui, et non le compilateur, qui attrape cette forme-là.

Essayer maintenant la variante que le compilateur attrape :

```ts
    const drawn = new Set(team.markedCardIds);
```

Lancer : `pnpm --filter @quetzal/module-loto typecheck`
Attendu : **ÉCHEC**, `Type 'Set<string>' is not assignable to type 'ReadonlySet<DrawnCardId>'`.

Rétablir la bonne ligne avant de continuer. Cette étape ne produit aucun commit : elle existe pour que l exécutant constate de ses yeux ce que chaque filet attrape, et ce qu il n attrape pas.

- [ ] **Étape 6 : commit**

```bash
git add packages/module-loto/src/application/claim.use-case.spec.ts
git commit -m "test(module-loto): réclamation, dont le marquage falsifié

Le cas adversarial de D1 ne peut s écrire qu ici : le domaine n accepte
aucune entrée de marquage avec laquelle mentir."
git add packages/module-loto/src/application/claim.use-case.ts
git commit -m "feat(module-loto): cas d usage de réclamation

Le serveur croise la tabla avec ses propres tirages, jamais avec le marquage.
La triche par marquage falsifié n a pas à être détectée : elle est sans objet."
```

### Tâche 26 : Cas d usage — état complet d une partie

Charge utile de l événement `state`, diffusé au socket qui vient de se connecter (spec section 8.4). C est la pièce qui rend la reprise après coupure réseau possible : un téléphone qui se reconnecte reçoit tout ce qu il lui faut pour se réafficher à l identique, sans rejouer l historique.

Deux points de vue sur la même partie : l animatrice voit toutes les équipes et le ruban des cartes sorties ; un joueur voit en plus sa propre tabla, ses marquages et son éventuel blocage. Un seul cas d usage, un paramètre facultatif.

**Fichiers :**
- Créer : `packages/module-loto/src/application/game-snapshot.use-case.ts`
- Test : `packages/module-loto/src/application/game-snapshot.use-case.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { GameNotFoundError, TeamNotFoundError } from '../domain/errors.js';
import { GameSnapshotUseCase } from './game-snapshot.use-case.js';
import { FakeGameRepository } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

async function build() {
  const games = new FakeGameRepository();
  const game = await games.create({
    deckId: 'deck-1',
    createdBy: 'u-1',
    joinCode: 'AAA222',
    settings: { ...SETTINGS },
  });
  await games.freezeCards(
    game.id,
    Array.from({ length: 20 }, (_, i) => ({ rank: i + 1, label: `Carta ${i + 1}`, imageId: null })),
  );
  await games.setStatus(game.id, 'open');
  const useCase = new GameSnapshotUseCase(games);
  return { games, game, useCase };
}

describe('GameSnapshotUseCase', () => {
  it('rend l état de la partie et ses réglages', async () => {
    const { game, useCase } = await build();

    const snapshot = await useCase.execute({ gameId: game.id });

    expect(snapshot.game.status).toBe('open');
    expect(snapshot.game.joinCode).toBe('AAA222');
    expect(snapshot.game.pattern).toBe('linea');
    expect(snapshot.game.remainingCardCount).toBe(20);
  });

  it('rend les cartes tirées dans l ordre du tirage', async () => {
    const { games, game, useCase } = await build();
    const frozen = await games.frozenCards(game.id);
    await games.appendDraw(game.id, 1, frozen[4]!.id);
    await games.appendDraw(game.id, 2, frozen[0]!.id);

    const snapshot = await useCase.execute({ gameId: game.id });

    expect(snapshot.draws.map((draw) => draw.label)).toEqual(['Carta 5', 'Carta 1']);
    expect(snapshot.game.remainingCardCount).toBe(18);
  });

  it('nomme une équipe d un du nom de son membre', async () => {
    const { games, game, useCase } = await build();
    const team = await games.createTeam(game.id, { teamIndex: 0, cardIds: [] });
    await games.addMember({ gameId: game.id, teamId: team.id, guestId: 'g-1', displayName: 'Ana' });

    const snapshot = await useCase.execute({ gameId: game.id });

    expect(snapshot.teams[0]?.name).toEqual({ kind: 'member', displayName: 'Ana' });
    expect(snapshot.teams[0]?.memberCount).toBe(1);
  });

  it('numérote une équipe dès qu elle compte plusieurs membres', async () => {
    const { games, game, useCase } = await build();
    const team = await games.createTeam(game.id, { teamIndex: 2, cardIds: [] });
    await games.addMember({ gameId: game.id, teamId: team.id, guestId: 'g-1', displayName: 'Ana' });
    await games.addMember({ gameId: game.id, teamId: team.id, guestId: 'g-2', displayName: 'Beto' });

    const snapshot = await useCase.execute({ gameId: game.id });

    expect(snapshot.teams[0]?.name).toEqual({ kind: 'numbered', number: 3 });
    expect(snapshot.teams[0]?.memberCount).toBe(2);
  });

  it('sans équipe demandée, ne rend aucune tabla', async () => {
    const { games, game, useCase } = await build();
    const frozen = await games.frozenCards(game.id);
    await games.createTeam(game.id, { teamIndex: 0, cardIds: frozen.slice(0, 16).map((c) => c.id) });

    const snapshot = await useCase.execute({ gameId: game.id });

    expect(snapshot.tabla).toBeNull();
  });

  it('avec une équipe, rend sa tabla, ses marquages et son blocage', async () => {
    const { games, game, useCase } = await build();
    const frozen = await games.frozenCards(game.id);
    const cardIds = frozen.slice(0, 16).map((card) => card.id);
    const team = await games.createTeam(game.id, { teamIndex: 0, cardIds });
    await games.setMarks(team.id, [cardIds[0]!, cardIds[3]!]);
    await games.blockTeam(team.id, 15);

    const snapshot = await useCase.execute({ gameId: game.id, teamId: team.id });

    expect(snapshot.tabla?.cards).toHaveLength(16);
    expect(snapshot.tabla?.cards[0]?.label).toBe('Carta 1');
    expect(snapshot.tabla?.markedCardIds).toEqual([cardIds[0], cardIds[3]]);
    expect(snapshot.tabla?.blockedUntilDraw).toBe(15);
  });

  it('rend la tabla dans l ordre de la tabla, pas dans celui du jeu', async () => {
    const { games, game, useCase } = await build();
    const frozen = await games.frozenCards(game.id);
    const cardIds = [...frozen.slice(0, 16).map((card) => card.id)].reverse();
    const team = await games.createTeam(game.id, { teamIndex: 0, cardIds });

    const snapshot = await useCase.execute({ gameId: game.id, teamId: team.id });

    expect(snapshot.tabla?.cards.map((card) => card.id)).toEqual(cardIds);
  });

  it('refuse une équipe inconnue', async () => {
    const { game, useCase } = await build();
    await expect(useCase.execute({ gameId: game.id, teamId: 'absent' })).rejects.toBeInstanceOf(TeamNotFoundError);
  });

  it('refuse une partie inconnue', async () => {
    const { useCase } = await build();
    await expect(useCase.execute({ gameId: 'absent' })).rejects.toBeInstanceOf(GameNotFoundError);
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/game-snapshot.use-case.spec.ts`
Attendu : ÉCHEC, `Cannot find module './game-snapshot.use-case.js'`.

- [ ] **Étape 3 : écrire l implémentation minimale**

```ts
import { Injectable } from '@nestjs/common';
import { GameNotFoundError, TeamNotFoundError } from '../domain/errors.js';
import type { GameStatus } from '../domain/game-status.js';
import type { PatternKey } from '../domain/pattern.js';
import { teamNameFor, type TeamName } from '../domain/team-name.js';
import type { DeckCard } from '../domain/ports/deck.repository.js';
import type { GameRepository } from '../domain/ports/game.repository.js';

export interface SnapshotGame {
  id: string;
  status: GameStatus;
  pattern: PatternKey;
  joinCode: string;
  maxTeams: number;
  falseClaimPenaltyDraws: number;
  lastDrawOrder: number;
  remainingCardCount: number;
  wonByTeamId: string | null;
}

export interface SnapshotTeam {
  id: string;
  name: TeamName;
  memberCount: number;
  blockedUntilDraw: number;
}

export interface SnapshotDraw {
  order: number;
  cardId: string;
  label: string;
}

export interface SnapshotTabla {
  teamId: string;
  cards: DeckCard[];
  markedCardIds: string[];
  blockedUntilDraw: number;
}

export interface GameSnapshot {
  game: SnapshotGame;
  teams: SnapshotTeam[];
  draws: SnapshotDraw[];
  tabla: SnapshotTabla | null;
}

@Injectable()
export class GameSnapshotUseCase {
  constructor(private readonly games: GameRepository) {}

  async execute(input: { gameId: string; teamId?: string }): Promise<GameSnapshot> {
    const game = await this.games.findById(input.gameId);
    if (game === null) throw new GameNotFoundError(input.gameId);

    const [frozen, teams, drawnCardIds] = await Promise.all([
      this.games.frozenCards(game.id),
      this.games.teams(game.id),
      this.games.drawnCards(game.id),
    ]);

    const byId = new Map(frozen.map((card) => [card.id, card]));

    const draws: SnapshotDraw[] = drawnCardIds.map((cardId, index) => ({
      order: index + 1,
      cardId,
      label: byId.get(cardId)?.label ?? '',
    }));

    let tabla: SnapshotTabla | null = null;
    if (input.teamId !== undefined) {
      const team = teams.find((candidate) => candidate.id === input.teamId);
      if (team === undefined) throw new TeamNotFoundError(input.teamId);
      tabla = {
        teamId: team.id,
        cards: team.cardIds.flatMap((cardId) => {
          const card = byId.get(cardId);
          return card === undefined ? [] : [card];
        }),
        markedCardIds: team.markedCardIds,
        blockedUntilDraw: team.blockedUntilDraw,
      };
    }

    return {
      game: {
        id: game.id,
        status: game.status,
        pattern: game.settings.pattern,
        joinCode: game.joinCode,
        maxTeams: game.settings.maxTeams,
        falseClaimPenaltyDraws: game.settings.falseClaimPenaltyDraws,
        lastDrawOrder: game.lastDrawOrder,
        remainingCardCount: frozen.length - drawnCardIds.length,
        wonByTeamId: game.wonByTeamId,
      },
      teams: teams.map((team) => ({
        id: team.id,
        name: teamNameFor({
          memberDisplayNames: team.memberDisplayNames,
          teamIndex: team.teamIndex,
        }),
        memberCount: team.memberDisplayNames.length,
        blockedUntilDraw: team.blockedUntilDraw,
      })),
      draws,
      tabla,
    };
  }
}
```

`flatMap` plutôt que `map` sur les cartes de la tabla : une carte introuvable dans le jeu figé est impossible par construction, mais `noUncheckedIndexedAccess` oblige à en décider, et laisser un trou dans la grille vaut mieux qu un `!` non justifié.

- [ ] **Étape 4 : lancer le test et vérifier qu il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/game-snapshot.use-case.spec.ts`
Attendu : `Tests 9 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/application/game-snapshot.use-case.spec.ts
git commit -m "test(module-loto): état complet d une partie, deux points de vue"
git add packages/module-loto/src/application/game-snapshot.use-case.ts
git commit -m "feat(module-loto): état complet d une partie

Charge utile de l événement state. C est la pièce qui rend la reprise après
coupure réseau possible : un téléphone qui se reconnecte se réaffiche à
l identique sans rejouer l historique."
```

### Tâche 27 : Cas d usage — gestion des jeux de cartes

Quatre actions de l enseignante hors partie : lister, dupliquer, éditer, supprimer. La duplication est celle qui compte : c est par elle qu Elda part de la lotería traditionnelle pour y mettre les photos de son propre jeu.

Le verrou de la décision D5 vit ici : un jeu ne peut pas être modifié tant qu une partie qui l utilise est en cours, et le supprimer emporte l historique des parties qui s y rattachent.

**Fichiers :**
- Créer : `packages/module-loto/src/application/manage-decks.use-case.ts`
- Test : `packages/module-loto/src/application/manage-decks.use-case.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { DeckLockedError, DeckNotFoundError } from '../domain/errors.js';
import { ManageDecksUseCase } from './manage-decks.use-case.js';
import { FakeDeckRepository, deckOf } from './testing/fake-repositories.js';

function build() {
  const decks = new FakeDeckRepository();
  const useCase = new ManageDecksUseCase(decks);
  return { decks, useCase };
}

describe('ManageDecksUseCase', () => {
  it('liste les jeux avec leur nombre de cartes', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54));

    const list = await useCase.list();

    expect(list).toHaveLength(1);
    expect(list[0]?.cardCount).toBe(54);
  });

  it('duplique un jeu avec toutes ses cartes', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54, { name: 'Lotería tradicional', isTemplate: true }));

    const copy = await useCase.duplicate({ deckId: 'deck-1', name: 'Mi lotería', createdBy: 'u-1' });

    expect(copy.id).not.toBe('deck-1');
    expect(copy.name).toBe('Mi lotería');
    expect(copy.cards).toHaveLength(54);
    expect(copy.cards[0]?.label).toBe('Carta 1');
  });

  it('une copie n est jamais un modèle, même copiée d un modèle', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54, { isTemplate: true }));

    const copy = await useCase.duplicate({ deckId: 'deck-1', name: 'Mi lotería', createdBy: 'u-1' });

    expect(copy.isTemplate).toBe(false);
  });

  it('éditer la copie ne touche pas au modèle', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54, { isTemplate: true }));
    const copy = await useCase.duplicate({ deckId: 'deck-1', name: 'Mi lotería', createdBy: 'u-1' });

    await useCase.editCard({ deckId: copy.id, rank: 1, patch: { label: 'El gallito' } });

    const original = await decks.findById('deck-1');
    expect(original?.cards[0]?.label).toBe('Carta 1');
  });

  it('crée un jeu vierge', async () => {
    const { useCase } = build();

    const deck = await useCase.createBlank({ name: 'Vocabulario', createdBy: 'u-1' });

    expect(deck.name).toBe('Vocabulario');
    expect(deck.cards).toHaveLength(0);
    expect(deck.isTemplate).toBe(false);
  });

  it('renomme un jeu', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(20));

    await useCase.rename({ deckId: 'deck-1', name: 'Autre nom' });

    expect((await decks.findById('deck-1'))?.name).toBe('Autre nom');
  });

  it('refuse d éditer un jeu qu une partie en cours utilise', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54));
    decks.unfinished.add('deck-1');

    await expect(
      useCase.editCard({ deckId: 'deck-1', rank: 1, patch: { label: 'Interdit' } }),
    ).rejects.toBeInstanceOf(DeckLockedError);
    await expect(useCase.rename({ deckId: 'deck-1', name: 'Interdit' })).rejects.toBeInstanceOf(DeckLockedError);
  });

  it('refuse de supprimer un jeu qu une partie en cours utilise', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54));
    decks.unfinished.add('deck-1');

    await expect(useCase.delete({ deckId: 'deck-1' })).rejects.toBeInstanceOf(DeckLockedError);
    expect(await decks.findById('deck-1')).not.toBeNull();
  });

  it('supprime un jeu qu aucune partie en cours n utilise', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54));

    await useCase.delete({ deckId: 'deck-1' });

    expect(await decks.findById('deck-1')).toBeNull();
  });

  it('refuse de dupliquer un jeu inconnu', async () => {
    const { useCase } = build();
    await expect(
      useCase.duplicate({ deckId: 'absent', name: 'x', createdBy: 'u-1' }),
    ).rejects.toBeInstanceOf(DeckNotFoundError);
  });

  it('duplique un jeu même verrouillé : la copie ne touche pas à l original', async () => {
    const { decks, useCase } = build();
    decks.add(deckOf(54));
    decks.unfinished.add('deck-1');

    const copy = await useCase.duplicate({ deckId: 'deck-1', name: 'Copie', createdBy: 'u-1' });
    expect(copy.cards).toHaveLength(54);
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/manage-decks.use-case.spec.ts`
Attendu : ÉCHEC, `Cannot find module './manage-decks.use-case.js'`.

- [ ] **Étape 3 : écrire l implémentation minimale**

```ts
import { Injectable } from '@nestjs/common';
import { DeckLockedError, DeckNotFoundError } from '../domain/errors.js';
import type { Deck, DeckRepository, DeckSummary } from '../domain/ports/deck.repository.js';

@Injectable()
export class ManageDecksUseCase {
  constructor(private readonly decks: DeckRepository) {}

  async list(): Promise<DeckSummary[]> {
    return this.decks.list();
  }

  async duplicate(input: { deckId: string; name: string; createdBy: string }): Promise<Deck> {
    const source = await this.require(input.deckId);
    // Pas de verrou ici : dupliquer ne touche jamais à l original, c est même
    // le geste qui permet à Elda de repartir d un jeu pendant qu il sert.
    return this.decks.create({
      name: input.name,
      isTemplate: false,
      createdBy: input.createdBy,
      cards: source.cards.map((card) => ({
        rank: card.rank,
        label: card.label,
        imageId: card.imageId,
      })),
    });
  }

  async createBlank(input: { name: string; createdBy: string }): Promise<Deck> {
    return this.decks.create({
      name: input.name,
      isTemplate: false,
      createdBy: input.createdBy,
      cards: [],
    });
  }

  async rename(input: { deckId: string; name: string }): Promise<void> {
    await this.requireUnlocked(input.deckId);
    await this.decks.rename(input.deckId, input.name);
  }

  async editCard(input: {
    deckId: string;
    rank: number;
    patch: { label?: string; imageId?: string | null };
  }): Promise<void> {
    await this.requireUnlocked(input.deckId);
    await this.decks.updateCard(input.deckId, input.rank, input.patch);
  }

  async delete(input: { deckId: string }): Promise<void> {
    await this.requireUnlocked(input.deckId);
    await this.decks.delete(input.deckId);
  }

  private async require(deckId: string): Promise<Deck> {
    const deck = await this.decks.findById(deckId);
    if (deck === null) throw new DeckNotFoundError(deckId);
    return deck;
  }

  private async requireUnlocked(deckId: string): Promise<Deck> {
    const deck = await this.require(deckId);
    if (await this.decks.hasUnfinishedGame(deckId)) throw new DeckLockedError(deckId);
    return deck;
  }
}
```

La suppression emporte l historique des parties liées, par la cascade déclarée dans le schéma. L avertissement explicite exigé par la spec est un geste d écran, pas de cas d usage : il vit à la tâche 34.

- [ ] **Étape 4 : lancer le test et vérifier qu il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/manage-decks.use-case.spec.ts`
Attendu : `Tests 11 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/application/manage-decks.use-case.spec.ts
git commit -m "test(module-loto): gestion des jeux de cartes et verrou D5"
git add packages/module-loto/src/application/manage-decks.use-case.ts
git commit -m "feat(module-loto): cas d usage de gestion des jeux de cartes

Un jeu ne peut être ni renommé, ni édité, ni supprimé tant qu une partie en
cours l utilise. Dupliquer reste toujours possible : c est le geste qui
permet de repartir d un jeu pendant qu il sert."
```

### Tâche 28 : Cas d usage — arrêter la partie

Spec section 5.4 : une partie se termine sur une réclamation valide, ou parce que l animatrice l arrête. Le second chemin manquait. Il sert deux fois par séance : la sonnerie tombe avant qu une équipe ait gagné, ou la salle d attente se referme sur une partie que personne n a rejointe.

**Fichiers :**
- Créer : `packages/module-loto/src/application/finish-game.use-case.ts`
- Test : `packages/module-loto/src/application/finish-game.use-case.spec.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import type { EventBus } from '@quetzal/core';
import { GameNotFoundError, InvalidGameTransitionError } from '../domain/errors.js';
import { FinishGameUseCase } from './finish-game.use-case.js';
import { FakeGameRepository, RecordingEventBus } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

async function build(status: 'draft' | 'open' | 'running' | 'finished' = 'running') {
  const games = new FakeGameRepository();
  const bus = new RecordingEventBus();
  const game = await games.create({
    deckId: 'deck-1',
    createdBy: 'u-1',
    joinCode: 'AAA222',
    settings: { ...SETTINGS },
  });
  await games.setStatus(game.id, status);
  const useCase = new FinishGameUseCase(games, bus as unknown as EventBus);
  return { games, bus, game, useCase };
}

describe('FinishGameUseCase', () => {
  it('arrête une partie en cours, sans gagnante', async () => {
    const { games, game, useCase } = await build('running');

    const finished = await useCase.execute({ gameId: game.id });

    expect(finished.status).toBe('finished');
    expect(finished.wonByTeamId).toBeNull();
    expect((await games.findById(game.id))?.status).toBe('finished');
  });

  it('referme une salle d attente que personne n a rejointe', async () => {
    const { game, useCase } = await build('open');
    const finished = await useCase.execute({ gameId: game.id });
    expect(finished.status).toBe('finished');
  });

  it('publie game.finished sans équipe gagnante', async () => {
    const { bus, game, useCase } = await build('running');
    await useCase.execute({ gameId: game.id });

    expect(bus.names()).toEqual(['loto.game.finished']);
    expect(bus.emitted[0]?.payload).toMatchObject({ wonByTeamId: null });
  });

  it('refuse d arrêter une partie encore en brouillon', async () => {
    const { game, useCase } = await build('draft');
    await expect(useCase.execute({ gameId: game.id })).rejects.toBeInstanceOf(InvalidGameTransitionError);
  });

  it('refuse d arrêter deux fois', async () => {
    const { game, useCase } = await build('running');
    await useCase.execute({ gameId: game.id });
    await expect(useCase.execute({ gameId: game.id })).rejects.toBeInstanceOf(InvalidGameTransitionError);
  });

  it('refuse une partie inconnue', async () => {
    const { useCase } = await build();
    await expect(useCase.execute({ gameId: 'absent' })).rejects.toBeInstanceOf(GameNotFoundError);
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/finish-game.use-case.spec.ts`
Attendu : ÉCHEC, `Cannot find module './finish-game.use-case.js'`.

- [ ] **Étape 3 : écrire l implémentation minimale**

```ts
import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { GameNotFoundError } from '../domain/errors.js';
import { assertTransition } from '../domain/game-status.js';
import type { GameRepository, GameState } from '../domain/ports/game.repository.js';

@Injectable()
export class FinishGameUseCase {
  constructor(
    private readonly games: GameRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(input: { gameId: string }): Promise<GameState> {
    const game = await this.games.findById(input.gameId);
    if (game === null) throw new GameNotFoundError(input.gameId);
    assertTransition(game.status, 'finished');

    await this.games.setStatus(game.id, 'finished');
    await this.eventBus.emit('loto.game.finished', {
      gameId: game.id,
      wonByTeamId: null,
      pattern: game.settings.pattern,
      drawCount: game.lastDrawOrder,
    });

    const reloaded = await this.games.findById(game.id);
    if (reloaded === null) throw new GameNotFoundError(game.id);
    return reloaded;
  }
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu il passe**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/finish-game.use-case.spec.ts`
Attendu : `Tests 6 passed`.

- [ ] **Étape 5 : commit**

```bash
git add packages/module-loto/src/application/finish-game.use-case.spec.ts
git commit -m "test(module-loto): arrêt de partie par l animatrice"
git add packages/module-loto/src/application/finish-game.use-case.ts
git commit -m "feat(module-loto): cas d usage d arrêt de partie

Second chemin vers finished, prévu par la spec section 5.4 : la sonnerie
tombe avant la victoire, ou la salle d attente se referme sur une partie que
personne n a rejointe."
```

**Fin de l étape 2.** Vérification complète avant de passer au temps réel :

- [ ] Lancer : `pnpm --filter @quetzal/module-loto test`
      Attendu : environ `Tests 150 passed`. Reporter le nombre réel.
- [ ] Lancer : `pnpm --filter @quetzal/module-loto test:integration`
      Attendu : `Tests 15 passed`.
- [ ] Lancer : `pnpm --filter @quetzal/module-loto typecheck && pnpm --filter @quetzal/module-loto lint`
      Attendu : aucune sortie.
- [ ] Lancer : `grep -rE "@nestjs|@prisma|react|@quetzal/db" packages/module-loto/src/domain/`
      Attendu : aucune correspondance. Le domaine est resté pur malgré une couche application entière posée dessus.
- [ ] Lancer : `grep -rn "markedCardIds" packages/module-loto/src/application/ | grep -v "^\s*//" | grep -v "\.spec\.ts"`
      Attendu : `toggle-mark.use-case.ts` qui l écrit, `game-snapshot.use-case.ts` qui l affiche, et `testing/fake-repositories.ts` qui le stocke.

      `claim.use-case.ts` **cite** `markedCardIds` dans le commentaire qui explique la décision D1 : c est voulu, et le filtre ci-dessus écarte les lignes de commentaire. Ce qui doit alerter, c est le mot dans une expression : `grep -n "markedCardIds" packages/module-loto/src/application/claim.use-case.ts` ne doit rendre qu une ligne, et cette ligne doit commencer par `//`. **Si elle participe à un calcul, s arrêter et relire la décision D1.**

## Étape 3 — Temps réel et écrans

But de l étape : le module devient un vrai module de la plateforme. Manifeste, routes HTTP, passerelle WebSocket, écran animateur, écran joueur. À la fin, une partie se joue de bout en bout dans un navigateur.

> **Ordre d exécution : 31, puis 30, puis 29.** Les trois premières tâches se référencent en chaîne — le manifeste importe le module NestJS, qui importe la passerelle et le diffuseur — et la numérotation suit le récit, pas les dépendances. Prises dans l ordre écrit, aucune ne compile avant la dernière. Prises dans l ordre 31, 30, 29, chacune laisse un `typecheck` vert derrière elle. Les tâches 32 et 33 suivent ensuite normalement.

### Tâche 29 : Manifeste, catalogues et suite de contrat

Deux entrées, comme le veut le contrat : `./manifest` côté serveur, `./client` côté hôte. Le piège a déjà coûté une session au sous-projet 1 : l entrée racine d un module tire NestJS dans le bundle Next, et le host ne doit jamais l importer.

**Fichiers :**
- Créer : `packages/module-loto/src/client.ts`
- Créer : `packages/module-loto/src/manifest.ts`
- Créer : `packages/module-loto/src/index.ts`
- Créer : `packages/module-loto/src/i18n/fr.json`
- Créer : `packages/module-loto/src/i18n/en.json`
- Créer : `packages/module-loto/src/i18n/es.json`
- Test : `packages/module-loto/tests/manifest.spec.ts`

- [ ] **Étape 1 : écrire le test de contrat**

`tests/manifest.spec.ts`, calqué sur celui de `module-hello` :

```ts
import { runContractSuite } from '@quetzal/core/testing/index';
import { resolve } from 'node:path';
import { manifest } from '../src/manifest.js';

runContractSuite(manifest, { moduleRoot: resolve(import.meta.dirname, '..') });
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run tests/manifest.spec.ts`
Attendu : ÉCHEC, `Cannot find module '../src/manifest.js'`.

- [ ] **Étape 3 : écrire les catalogues de traduction**

Parité stricte des clés entre les trois langues : la suite de contrat la vérifie, et une clé manquante fait échouer le build de l hôte.

`src/i18n/fr.json` :

```json
{
  "module": {
    "loto": {
      "nav": { "title": "Lotería" },
      "decks": {
        "title": "Jeux de cartes",
        "empty": "Aucun jeu de cartes pour l instant",
        "cardCount": "{count, plural, one {# carte} other {# cartes}}",
        "duplicate": "Dupliquer",
        "createBlank": "Créer un jeu vierge",
        "rename": "Renommer",
        "delete": "Supprimer",
        "deleteWarning": "Supprimer ce jeu efface aussi l historique des parties qui s y rattachent. Cette action est définitive.",
        "locked": "Ce jeu est utilisé par une partie en cours, il ne peut pas être modifié",
        "tooSmall": "Il faut au moins 16 cartes pour jouer"
      },
      "game": {
        "create": "Nouvelle partie",
        "pattern": "Figure gagnante",
        "maxTeams": "Nombre maximum d équipes",
        "penalty": "Pénalité de fausse réclamation, en tours",
        "open": "Ouvrir la salle",
        "draw": "Tirer une carte",
        "finish": "Arrêter la partie",
        "joinCode": "Code d entrée",
        "waiting": "En attente des joueurs",
        "remaining": "{count, plural, one {# carte restante} other {# cartes restantes}}",
        "wonBy": "Victoire de {team}",
        "stopped": "Partie arrêtée"
      },
      "pattern": {
        "linea": "Línea",
        "esquinas": "Cuatro esquinas",
        "centro": "El centro",
        "llena": "Lotería llena"
      },
      "team": { "numbered": "Équipe {number}" },
      "player": {
        "claim": "¡Lotería!",
        "blocked": "Réclamation bloquée jusqu au tirage {draw}",
        "rejected": "Réclamation refusée",
        "waiting": "La partie va commencer"
      }
    }
  }
}
```

`src/i18n/es.json` :

```json
{
  "module": {
    "loto": {
      "nav": { "title": "Lotería" },
      "decks": {
        "title": "Barajas",
        "empty": "Todavía no hay ninguna baraja",
        "cardCount": "{count, plural, one {# carta} other {# cartas}}",
        "duplicate": "Duplicar",
        "createBlank": "Crear una baraja vacía",
        "rename": "Renombrar",
        "delete": "Eliminar",
        "deleteWarning": "Eliminar esta baraja borra también el historial de las partidas asociadas. Esta acción es definitiva.",
        "locked": "Una partida en curso usa esta baraja, no se puede modificar",
        "tooSmall": "Hacen falta al menos 16 cartas para jugar"
      },
      "game": {
        "create": "Nueva partida",
        "pattern": "Figura ganadora",
        "maxTeams": "Número máximo de equipos",
        "penalty": "Penalización por falsa lotería, en turnos",
        "open": "Abrir la sala",
        "draw": "Sacar una carta",
        "finish": "Terminar la partida",
        "joinCode": "Código de entrada",
        "waiting": "Esperando a los jugadores",
        "remaining": "{count, plural, one {# carta restante} other {# cartas restantes}}",
        "wonBy": "Gana {team}",
        "stopped": "Partida terminada"
      },
      "pattern": {
        "linea": "Línea",
        "esquinas": "Cuatro esquinas",
        "centro": "El centro",
        "llena": "Lotería llena"
      },
      "team": { "numbered": "Equipo {number}" },
      "player": {
        "claim": "¡Lotería!",
        "blocked": "Lotería bloqueada hasta la carta {draw}",
        "rejected": "Lotería rechazada",
        "waiting": "La partida va a empezar"
      }
    }
  }
}
```

`src/i18n/en.json` :

```json
{
  "module": {
    "loto": {
      "nav": { "title": "Lotería" },
      "decks": {
        "title": "Card decks",
        "empty": "No card deck yet",
        "cardCount": "{count, plural, one {# card} other {# cards}}",
        "duplicate": "Duplicate",
        "createBlank": "Create an empty deck",
        "rename": "Rename",
        "delete": "Delete",
        "deleteWarning": "Deleting this deck also erases the history of the games that use it. This cannot be undone.",
        "locked": "A running game uses this deck, it cannot be edited",
        "tooSmall": "At least 16 cards are needed to play",
        "cardCount_": ""
      },
      "game": {
        "create": "New game",
        "pattern": "Winning pattern",
        "maxTeams": "Maximum number of teams",
        "penalty": "False claim penalty, in turns",
        "open": "Open the room",
        "draw": "Draw a card",
        "finish": "Stop the game",
        "joinCode": "Join code",
        "waiting": "Waiting for players",
        "remaining": "{count, plural, one {# card left} other {# cards left}}",
        "wonBy": "{team} wins",
        "stopped": "Game stopped"
      },
      "pattern": {
        "linea": "Línea",
        "esquinas": "Cuatro esquinas",
        "centro": "El centro",
        "llena": "Lotería llena"
      },
      "team": { "numbered": "Team {number}" },
      "player": {
        "claim": "¡Lotería!",
        "blocked": "Claim blocked until draw {draw}",
        "rejected": "Claim rejected",
        "waiting": "The game is about to start"
      }
    }
  }
}
```

**Attention** : la clé `"cardCount_": ""` ci-dessus est délibérément fausse. Elle n existe ni en français ni en espagnol. Elle sert à vérifier, à l étape suivante, que la suite de contrat attrape bien une rupture de parité. La retirer une fois l échec constaté.

Les quatre noms de figures ne sont pas traduits : ce sont les noms espagnols du jeu, et une enseignante d espagnol ne dit pas « ligne » en classe.

- [ ] **Étape 4 : écrire le manifeste client**

`src/client.ts` :

```ts
import type { ClientModuleManifest } from '@quetzal/core';

// Bundlé par le host (Next.js) : surface UI seulement, aucun import serveur ici.
export const clientManifest: ClientModuleManifest = {
  slug: 'loto',
  name: { fr: 'Lotería', en: 'Lotería', es: 'Lotería' },
  uiRoutes: [
    {
      path: '',
      component: () => import('./presentation/ui/decks-page.js'),
      requiredRoles: ['owner', 'creator'],
      layout: 'shell',
    },
    {
      path: 'games/:gameId',
      component: () => import('./presentation/ui/animator-page.js'),
      requiredRoles: ['owner', 'creator'],
      layout: 'shell',
    },
  ],
  navItem: {
    icon: 'grid-3x3',
    labelKey: 'module.loto.nav.title',
    visibleTo: ['owner', 'creator'],
    order: 20,
  },
  guestJoinComponent: () => import('./presentation/ui/guest-join.js'),
};
```

- [ ] **Étape 5 : écrire le manifeste serveur**

`src/manifest.ts` :

```ts
import type { QuetzalModuleManifest } from '@quetzal/core';
import { LotoModule } from './loto.module.js';
import { clientManifest } from './client.js';

export const manifest: QuetzalModuleManifest = {
  ...clientManifest,
  description: {
    fr: 'Lotería mexicaine jouable en classe',
    en: 'Mexican lotería playable in class',
    es: 'Lotería mexicana para jugar en clase',
  },
  version: '0.1.0',
  contractVersion: '1.0.0',
  enabledByDefault: false,
  apiModule: LotoModule,
  eventsPublished: [
    { name: 'loto.game.started', typeRef: 'LotoGameStartedEvent' },
    { name: 'loto.card.drawn', typeRef: 'LotoCardDrawnEvent' },
    { name: 'loto.claim.rejected', typeRef: 'LotoClaimRejectedEvent' },
    { name: 'loto.game.finished', typeRef: 'LotoGameFinishedEvent' },
  ],
  permissions: {
    'http:GET /api/modules/loto/decks': ['owner', 'creator'],
    'http:POST /api/modules/loto/decks': ['owner', 'creator'],
    'http:PATCH /api/modules/loto/decks/:id': ['owner', 'creator'],
    'http:DELETE /api/modules/loto/decks/:id': ['owner', 'creator'],
    'http:GET /api/modules/loto/games': ['owner', 'creator'],
    'http:POST /api/modules/loto/games': ['owner', 'creator'],
    'http:POST /api/modules/loto/games/:id/open': ['owner', 'creator'],
    'http:POST /api/modules/loto/games/:id/draw': ['owner', 'creator'],
    'http:POST /api/modules/loto/games/:id/finish': ['owner', 'creator'],
    'ws:mark': ['guest', 'learner'],
    'ws:claim': ['guest', 'learner'],
  },
  guestAccess: {
    enabled: true,
    tokenTTL: 7200,
    requireDisplayName: true,
    maxConcurrentPerSession: 40,
  },
  prismaModels: 'prisma/models.prisma',
};
```

`enabledByDefault: false` : contrairement au module stub, la lotería s active par locataire. Les deux routes d images de la spec section 8.3 ne sont pas déclarées ici — elles arrivent avec leurs contrôleurs à l étape 6. Déclarer une permission pour une route qui n existe pas donnerait une matrice qui ment.

`maxConcurrentPerSession: 40` : une classe entière plus quelques reconnexions, pas cent comme le module stub.

**Rappel de la convention de sécurité WS** posée au sous-projet 1 : tout message WebSocket doit figurer dans `permissions` sous `ws:<event>`, sinon il est refusé pour tout le monde, fail closed. Ajouter un message côté passerelle sans l ajouter ici produit un message qui ne passe jamais, sans erreur visible côté client.

- [ ] **Étape 6 : écrire l entrée racine**

`src/index.ts` :

```ts
export { manifest } from './manifest.js';
export { LotoModule } from './loto.module.js';
```

- [ ] **Étape 7 : lancer la suite de contrat et constater qu elle attrape la parité**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run tests/manifest.spec.ts`
Attendu : ÉCHEC sur la parité des clés i18n, à cause de `cardCount_` présente en anglais seulement.

Si la suite passe malgré cette clé, la vérification de parité est cassée : s arrêter et le signaler, c est un défaut du noyau et non du module.

- [ ] **Étape 8 : retirer la clé fautive et vérifier que tout passe**

Retirer `"cardCount_": ""` de `src/i18n/en.json`.

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run tests/manifest.spec.ts`
Attendu : la suite de contrat passe entièrement.

La tâche 30 crée `loto.module.ts`. Tant qu il n existe pas, `manifest.ts` ne compile pas : enchaîner les deux tâches sans lancer `typecheck` entre elles.

- [ ] **Étape 9 : commit**

```bash
git add packages/module-loto/tests/manifest.spec.ts
git commit -m "test(module-loto): suite de contrat du manifeste"
git add packages/module-loto/src/client.ts packages/module-loto/src/manifest.ts packages/module-loto/src/index.ts packages/module-loto/src/i18n
git commit -m "feat(module-loto): manifeste, catalogues et matrice de permissions

Deux entrées comme le veut le contrat. Tout message WS est déclaré sous
ws:<event> : le noyau refuse par défaut ce qui n y figure pas."
```

### Tâche 30 : Module NestJS et contrôleurs HTTP

Décision D7 : les commandes de l animatrice passent en HTTP, parce qu elles méritent un code de retour et une idempotence claire. Le WebSocket ne sert qu à diffuser.

Première marche : les erreurs de domaine doivent cesser de ressortir en 500. Le filtre global du noyau ne connaît aujourd hui que les erreurs du noyau ; une `DeckTooSmallError` devient une erreur serveur et un bruit Sentry, alors que c est une requête invalide.

**Fichiers :**
- Modifier : `apps/api/src/filters/global-exception.filter.ts`
- Test : `apps/api/src/filters/global-exception.filter.spec.ts`
- Créer : `packages/module-loto/src/presentation/dto/loto.dto.ts`
- Créer : `packages/module-loto/src/presentation/deck.controller.ts`
- Créer : `packages/module-loto/src/presentation/game.controller.ts`
- Créer : `packages/module-loto/src/loto.module.ts`

- [ ] **Étape 1 : écrire le test du filtre qui échoue**

À ajouter dans `apps/api/src/filters/global-exception.filter.spec.ts` :

```ts
import { DomainError } from '@quetzal/core/errors';

class SampleDomainError extends DomainError {
  constructor() {
    super('Un jeu de cartes doit contenir au moins 16 cartes');
  }
}

describe('erreurs de domaine des modules', () => {
  it('répond 400 et non 500 : une règle métier violée est une requête invalide', () => {
    const { host, status, json } = fakeHost();
    new GlobalExceptionFilter().catch(new SampleDomainError(), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'sample_domain_error' }),
    );
  });

  it('transmet le message du domaine, qui est écrit pour être lu', () => {
    const { host, json } = fakeHost();
    new GlobalExceptionFilter().catch(new SampleDomainError(), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('16 cartes') }),
    );
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter quetzal-api exec vitest run src/filters/global-exception.filter.spec.ts`
Attendu : ÉCHEC, `expected 500 to be 400`.

- [ ] **Étape 3 : écrire l implémentation minimale**

Dans `global-exception.filter.ts`, ajouter l import et la branche, **après** celles de `TenantScopeViolationError` et `TenantContextMissingError` et **avant** le repli en 500 :

```ts
import { DomainError } from '@quetzal/core/errors';

function toErrorCode(name: string): string {
  return name
    .replace(/Error$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}
```

```ts
    if (exception instanceof DomainError) {
      // Une règle métier violée est une requête invalide, pas une panne : ni
      // 500, ni Sentry. Le message du domaine est écrit pour être lu.
      logger.warn({ err: exception, path: request.url }, 'domain rule violated');
      return response.status(HttpStatus.BAD_REQUEST).json({
        error: toErrorCode(exception.name),
        message: exception.message,
      });
    }
```

`TenantScopeViolationError` et `TenantContextMissingError` héritent elles aussi de `DomainError` : leurs branches doivent rester **avant** celle-ci, sinon elles perdent leurs codes 403 et 401. Le test existant du sous-projet 1 le vérifie.

- [ ] **Étape 4 : lancer les tests du filtre**

Lancer : `pnpm --filter quetzal-api exec vitest run src/filters/global-exception.filter.spec.ts`
Attendu : tous les tests passent, y compris les deux du sous-projet 1 sur 401 et 403.

- [ ] **Étape 5 : commit du filtre**

```bash
git add apps/api/src/filters/global-exception.filter.spec.ts
git commit -m "test(api): une erreur de domaine de module répond 400"
git add apps/api/src/filters/global-exception.filter.ts
git commit -m "feat(api): mappe DomainError vers 400 au lieu de 500

Une règle métier violée est une requête invalide, pas une panne. Les branches
tenant restent avant celle-ci : elles héritent de DomainError et gardent
leurs codes 403 et 401."
```

- [ ] **Étape 6 : écrire les schémas Zod d entrée**

`src/presentation/dto/loto.dto.ts` :

```ts
import { z } from 'zod';
import { GAME_STATUSES } from '../../domain/game-status.js';
import { PATTERN_KEYS } from '../../domain/pattern.js';

export const createDeckSchema = z.object({
  name: z.string().min(1).max(120),
  duplicateOf: z.string().min(1).optional(),
});

export const patchDeckSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  card: z
    .object({
      rank: z.number().int().min(1),
      label: z.string().min(1).max(80).optional(),
      imageId: z.string().min(1).nullable().optional(),
    })
    .optional(),
});

export const createGameSchema = z.object({
  deckId: z.string().min(1),
  pattern: z.enum(PATTERN_KEYS),
  maxTeams: z.number().int().min(1).max(20),
  falseClaimPenaltyDraws: z.number().int().min(0).max(99),
});

export type CreateDeckBody = z.infer<typeof createDeckSchema>;
export type PatchDeckBody = z.infer<typeof patchDeckSchema>;
export type CreateGameBody = z.infer<typeof createGameSchema>;

export const gameStatusValues = GAME_STATUSES;
```

`z.enum(PATTERN_KEYS)` marche directement parce que `PATTERN_KEYS` est déclaré `as const` : c est la deuxième raison d être de ce `as const`, la première étant le typeguard de la tâche 15.

- [ ] **Étape 7 : écrire les contrôleurs**

`src/presentation/deck.controller.ts` :

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, BadRequestException } from '@nestjs/common';
import { ManageDecksUseCase } from '../application/manage-decks.use-case.js';
import { DeckNotFoundError } from '../domain/errors.js';
import { getCurrentTenant } from '@quetzal/core';
import { createDeckSchema, patchDeckSchema } from './dto/loto.dto.js';

@Controller('api/modules/loto/decks')
export class DeckController {
  constructor(private readonly decks: ManageDecksUseCase) {}

  @Get()
  async list() {
    return { decks: await this.decks.list() };
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createDeckSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { userId } = getCurrentTenant();
    if (userId === undefined || userId === null) throw new BadRequestException('Utilisateur requis');

    if (parsed.data.duplicateOf !== undefined) {
      return this.decks.duplicate({
        deckId: parsed.data.duplicateOf,
        name: parsed.data.name,
        createdBy: userId,
      });
    }
    return this.decks.createBlank({ name: parsed.data.name, createdBy: userId });
  }

  @Patch(':id')
  async patch(@Param('id') id: string, @Body() body: unknown) {
    const parsed = patchDeckSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    if (parsed.data.name !== undefined) {
      await this.decks.rename({ deckId: id, name: parsed.data.name });
    }
    if (parsed.data.card !== undefined) {
      const { rank, ...patch } = parsed.data.card;
      await this.decks.editCard({ deckId: id, rank, patch });
    }
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.decks.delete({ deckId: id });
    return { ok: true };
  }
}
```

`src/presentation/game.controller.ts` :

```ts
import { Body, Controller, Get, Param, Post, BadRequestException } from '@nestjs/common';
import { getCurrentTenant } from '@quetzal/core';
import { CreateGameUseCase } from '../application/create-game.use-case.js';
import { DrawCardUseCase } from '../application/draw-card.use-case.js';
import { FinishGameUseCase } from '../application/finish-game.use-case.js';
import { GameSnapshotUseCase } from '../application/game-snapshot.use-case.js';
import { OpenGameUseCase } from '../application/open-game.use-case.js';
import { LotoBroadcaster } from './loto.broadcaster.js';
import { createGameSchema } from './dto/loto.dto.js';

@Controller('api/modules/loto/games')
export class GameController {
  constructor(
    private readonly createGame: CreateGameUseCase,
    private readonly openGame: OpenGameUseCase,
    private readonly drawCard: DrawCardUseCase,
    private readonly finishGame: FinishGameUseCase,
    private readonly snapshot: GameSnapshotUseCase,
    private readonly broadcaster: LotoBroadcaster,
  ) {}

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createGameSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { userId } = getCurrentTenant();
    if (userId === undefined || userId === null) throw new BadRequestException('Utilisateur requis');

    return this.createGame.execute({
      deckId: parsed.data.deckId,
      createdBy: userId,
      settings: {
        pattern: parsed.data.pattern,
        maxTeams: parsed.data.maxTeams,
        falseClaimPenaltyDraws: parsed.data.falseClaimPenaltyDraws,
      },
    });
  }

  @Get(':id')
  async read(@Param('id') id: string) {
    return this.snapshot.execute({ gameId: id });
  }

  @Post(':id/open')
  async open(@Param('id') id: string) {
    const game = await this.openGame.execute({ gameId: id });
    await this.broadcaster.gameChanged(id);
    return game;
  }

  @Post(':id/draw')
  async draw(@Param('id') id: string) {
    const result = await this.drawCard.execute({ gameId: id });
    if (result.drawn) {
      await this.broadcaster.cardDrawn(id, result.order, result.card);
    }
    return result;
  }

  @Post(':id/finish')
  async finish(@Param('id') id: string) {
    const game = await this.finishGame.execute({ gameId: id });
    await this.broadcaster.gameFinished(id, null);
    return game;
  }
}
```

`LotoBroadcaster` est écrit à la tâche 31. Les deux tâches se compilent ensemble.

- [ ] **Étape 8 : écrire le module NestJS**

`src/loto.module.ts` :

```ts
import { Module } from '@nestjs/common';
import { eventBus } from '@quetzal/core';
import { ClaimUseCase } from './application/claim.use-case.js';
import { CreateGameUseCase } from './application/create-game.use-case.js';
import { DrawCardUseCase } from './application/draw-card.use-case.js';
import { FinishGameUseCase } from './application/finish-game.use-case.js';
import { GameSnapshotUseCase } from './application/game-snapshot.use-case.js';
import { JoinGameUseCase } from './application/join-game.use-case.js';
import { ManageDecksUseCase } from './application/manage-decks.use-case.js';
import { OpenGameUseCase } from './application/open-game.use-case.js';
import { ToggleMarkUseCase } from './application/toggle-mark.use-case.js';
import type { DeckRepository } from './domain/ports/deck.repository.js';
import type { GameRepository } from './domain/ports/game.repository.js';
import { PrismaDeckRepository } from './infrastructure/prisma-deck.repository.js';
import { PrismaGameRepository } from './infrastructure/prisma-game.repository.js';
import { DeckController } from './presentation/deck.controller.js';
import { GameController } from './presentation/game.controller.js';
import { LotoBroadcaster } from './presentation/loto.broadcaster.js';
import { LotoGateway } from './presentation/loto.gateway.js';

const DECKS = 'LotoDeckRepository';
const GAMES = 'LotoGameRepository';

@Module({
  controllers: [DeckController, GameController],
  providers: [
    LotoGateway,
    LotoBroadcaster,
    { provide: DECKS, useClass: PrismaDeckRepository },
    { provide: GAMES, useClass: PrismaGameRepository },
    {
      provide: ManageDecksUseCase,
      useFactory: (decks: DeckRepository) => new ManageDecksUseCase(decks),
      inject: [DECKS],
    },
    {
      provide: CreateGameUseCase,
      useFactory: (decks: DeckRepository, games: GameRepository) =>
        new CreateGameUseCase(decks, games, eventBus, Math.random),
      inject: [DECKS, GAMES],
    },
    {
      provide: OpenGameUseCase,
      useFactory: (decks: DeckRepository, games: GameRepository) =>
        new OpenGameUseCase(decks, games, eventBus),
      inject: [DECKS, GAMES],
    },
    {
      provide: JoinGameUseCase,
      useFactory: (games: GameRepository) => new JoinGameUseCase(games, Math.random),
      inject: [GAMES],
    },
    {
      provide: DrawCardUseCase,
      useFactory: (games: GameRepository) => new DrawCardUseCase(games, eventBus, Math.random),
      inject: [GAMES],
    },
    {
      provide: ToggleMarkUseCase,
      useFactory: (games: GameRepository) => new ToggleMarkUseCase(games),
      inject: [GAMES],
    },
    {
      provide: ClaimUseCase,
      useFactory: (games: GameRepository) => new ClaimUseCase(games, eventBus),
      inject: [GAMES],
    },
    {
      provide: FinishGameUseCase,
      useFactory: (games: GameRepository) => new FinishGameUseCase(games, eventBus),
      inject: [GAMES],
    },
    {
      provide: GameSnapshotUseCase,
      useFactory: (games: GameRepository) => new GameSnapshotUseCase(games),
      inject: [GAMES],
    },
  ],
})
export class LotoModule {}
```

`Math.random` est injecté ici, une seule fois, à la frontière du framework. C est la contrepartie de la règle du domaine : aucune fonction pure n appelle l horloge ni le hasard elle-même.

- [ ] **Étape 9 : vérifier la compilation**

Lancer : `pnpm --filter @quetzal/module-loto typecheck`
Attendu : aucune erreur, une fois la tâche 31 écrite. Si `loto.broadcaster.js` ou `loto.gateway.js` manquent encore, passer à la tâche 31 et revenir.

- [ ] **Étape 10 : commit**

```bash
git add packages/module-loto/src/presentation/dto packages/module-loto/src/presentation/deck.controller.ts packages/module-loto/src/presentation/game.controller.ts packages/module-loto/src/loto.module.ts
git commit -m "feat(module-loto): module NestJS et contrôleurs HTTP

Décision D7 : les commandes de l animatrice passent en HTTP, le WebSocket ne
sert qu à diffuser. Exempté du cycle test-first au titre de CLAUDE.md
paragraphe 5, couche Presentation et wiring ; couvert par l E2E de la tâche 35."
```

### Tâche 31 : Passerelle WebSocket et diffusion

Trois pièges déjà payés se rejoignent ici. Les relire avant d écrire une ligne.

1. **Nest renvoie un `@SubscribeMessage` qui retourne `{event, data}` comme un événement, jamais comme un accusé de réception.** Trouvé en sondant la production le 03/09. Le client doit écouter l événement, pas passer un callback. Un ping mort pendant une session entière avait cette cause.
2. **L identité WS est résolue au handshake, jamais par message.** Le module ne déclare ni `cors` ni garde : l adaptateur de la plateforme s en charge et pose l identité sur `client.data`. Un message absent de `permissions` est refusé pour tout le monde, sans erreur visible côté client.
3. **Les rewrites Vercel ne relaient pas les upgrades WebSocket.** Le client vise `NEXT_PUBLIC_API_URL` directement, via `connectSocket` de `@quetzal/core/client`.

Point de conception propre au Lotería : **il n existe pas de message d entrée**. Un invité est affecté à son équipe à la connexion, à partir de l identité que le handshake a déjà posée. L écran joueur n a donc jamais de fenêtre pendant laquelle il serait connecté sans tabla.

**Fichiers :**
- Modifier : `packages/core/src/rooms.ts`
- Test : `packages/core/src/rooms.spec.ts`
- Créer : `packages/module-loto/src/presentation/loto.broadcaster.ts`
- Créer : `packages/module-loto/src/presentation/loto.gateway.ts`
- Test : `packages/module-loto/src/presentation/loto.gateway.integration.spec.ts`

- [ ] **Étape 1 : écrire le test du salon d équipe qui échoue**

Les marquages se diffusent aux coéquipiers seulement, pas à toute la partie : il faut un salon par équipe. CLAUDE.md interdit toute chaîne de salon écrite à la main, donc le helper vit dans le noyau.

À ajouter dans `packages/core/src/rooms.spec.ts` :

```ts
describe('rooms.subgroup', () => {
  it('dérive un salon plus fin à l intérieur d une session', () => {
    expect(rooms.subgroup('loto', 'game-1', 'team-2')).toBe('loto:session:game-1:team-2');
  });

  it('reste préfixé par le salon de session, pour que le module ne puisse pas viser ailleurs', () => {
    expect(rooms.subgroup('loto', 'game-1', 'team-2')).toContain(rooms.session('loto', 'game-1'));
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/core exec vitest run src/rooms.spec.ts`
Attendu : ÉCHEC, `rooms.subgroup is not a function`.

- [ ] **Étape 3 : écrire l implémentation minimale**

`packages/core/src/rooms.ts` :

```ts
export const rooms = {
  session: (moduleSlug: string, sessionId: string) => `${moduleSlug}:session:${sessionId}` as const,
  tenant:  (moduleSlug: string, tenantId: string)  => `${moduleSlug}:tenant:${tenantId}` as const,
  subgroup: (moduleSlug: string, sessionId: string, groupId: string) =>
    `${moduleSlug}:session:${sessionId}:${groupId}` as const,
};
```

- [ ] **Étape 4 : lancer le test et reconstruire le noyau**

Lancer : `pnpm --filter @quetzal/core exec vitest run src/rooms.spec.ts && pnpm --filter @quetzal/core build`
Attendu : les tests passent, le build ne dit rien.

- [ ] **Étape 5 : commit du noyau**

```bash
git add packages/core/src/rooms.spec.ts
git commit -m "test(core): salon plus fin à l intérieur d une session"
git add packages/core/src/rooms.ts
git commit -m "feat(core): rooms.subgroup

Un module qui diffuse à un sous-ensemble d une session ne doit pas écrire la
chaîne à la main : le préfixe de session reste garanti par le helper."
```

- [ ] **Étape 6 : écrire le diffuseur**

`src/presentation/loto.broadcaster.ts` :

```ts
import { Injectable } from '@nestjs/common';
import { rooms } from '@quetzal/core';
import type { Server } from 'socket.io';
import { GameSnapshotUseCase } from '../application/game-snapshot.use-case.js';
import type { ClaimResult } from '../application/claim.use-case.js';
import type { DeckCard } from '../domain/ports/deck.repository.js';

/**
 * Le contrôleur HTTP exécute la commande, le diffuseur prévient la salle. Cette
 * séparation est la décision D7 : les commandes méritent un code de retour, le
 * WebSocket ne sert qu à diffuser.
 */
@Injectable()
export class LotoBroadcaster {
  private server: Server | null = null;

  constructor(private readonly snapshot: GameSnapshotUseCase) {}

  attach(server: Server): void {
    this.server = server;
  }

  private room(gameId: string): string {
    return rooms.session('loto', gameId);
  }

  async gameChanged(gameId: string): Promise<void> {
    const snapshot = await this.snapshot.execute({ gameId });
    this.server?.to(this.room(gameId)).emit('game-changed', snapshot.game);
  }

  async teamJoined(gameId: string, teamId: string): Promise<void> {
    const snapshot = await this.snapshot.execute({ gameId });
    const team = snapshot.teams.find((candidate) => candidate.id === teamId);
    if (team === undefined) return;
    this.server?.to(this.room(gameId)).emit('team-joined', team);
  }

  async cardDrawn(gameId: string, order: number, card: DeckCard): Promise<void> {
    this.server?.to(this.room(gameId)).emit('card-drawn', {
      order,
      cardId: card.id,
      label: card.label,
      imageId: card.imageId,
    });
  }

  markChanged(
    gameId: string,
    teamId: string,
    payload: { cardId: string; marked: boolean; byGuestId: string },
  ): void {
    this.server?.to(rooms.subgroup('loto', gameId, teamId)).emit('mark-changed', payload);
  }

  claimResult(gameId: string, teamId: string, result: ClaimResult): void {
    this.server?.to(this.room(gameId)).emit('claim-result', {
      teamId,
      valid: result.valid,
      atDraw: result.atDraw,
      blockedUntilDraw: result.blockedUntilDraw,
    });
  }

  async gameFinished(gameId: string, wonByTeamId: string | null): Promise<void> {
    const snapshot = await this.snapshot.execute({ gameId });
    this.server?.to(this.room(gameId)).emit('game-finished', {
      wonByTeamId,
      pattern: snapshot.game.pattern,
      drawCount: snapshot.game.lastDrawOrder,
    });
  }
}
```

- [ ] **Étape 7 : écrire la passerelle**

`src/presentation/loto.gateway.ts` :

```ts
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { rooms, logger } from '@quetzal/core';
import type { Server, Socket } from 'socket.io';
import { ClaimUseCase } from '../application/claim.use-case.js';
import { GameSnapshotUseCase } from '../application/game-snapshot.use-case.js';
import { JoinGameUseCase } from '../application/join-game.use-case.js';
import { ToggleMarkUseCase } from '../application/toggle-mark.use-case.js';
import { LotoBroadcaster } from './loto.broadcaster.js';

interface SocketData {
  role?: string;
  guestId?: string;
  displayName?: string;
  sessionId?: string;
  userId?: string;
  tenantId?: string;
  teamId?: string;
  gameId?: string;
}

// CORS et authentification du handshake appartiennent à l adaptateur de la
// plateforme, jamais au module.
@WebSocketGateway({ namespace: 'ws/loto' })
export class LotoGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly join: JoinGameUseCase,
    private readonly toggleMark: ToggleMarkUseCase,
    private readonly claim: ClaimUseCase,
    private readonly snapshot: GameSnapshotUseCase,
    private readonly broadcaster: LotoBroadcaster,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    this.broadcaster.attach(this.server);
    const data = client.data as SocketData;

    // Un invité tient son identifiant de partie de son jeton : il ne peut pas
    // en viser une autre. Une animatrice le passe en query, et le cloisonnement
    // par locataire fait le reste — une partie d un autre locataire est
    // introuvable, donc la connexion échoue proprement.
    const gameId =
      data.role === 'guest' ? data.sessionId : queryValue(client.handshake.query['gameId']);
    if (gameId === undefined) {
      client.disconnect(true);
      return;
    }
    data.gameId = gameId;

    try {
      if (data.role === 'guest' && data.guestId !== undefined) {
        const result = await this.join.execute({
          gameId,
          guestId: data.guestId,
          displayName: data.displayName ?? 'Invité',
        });
        data.teamId = result.teamId;
        await client.join(rooms.subgroup('loto', gameId, result.teamId));
      }

      await client.join(rooms.session('loto', gameId));

      const snapshot = await this.snapshot.execute(
        data.teamId === undefined ? { gameId } : { gameId, teamId: data.teamId },
      );
      client.emit('state', snapshot);

      if (data.teamId !== undefined) await this.broadcaster.teamJoined(gameId, data.teamId);
    } catch (err) {
      logger.warn({ err, gameId }, 'loto: connexion refusée');
      client.emit('join-failed', { reason: (err as Error).name });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('mark')
  async handleMark(
    @MessageBody() body: { cardId: string; marked: boolean },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const data = client.data as SocketData;
    if (data.gameId === undefined || data.teamId === undefined) return;

    const result = await this.toggleMark.execute({
      gameId: data.gameId,
      teamId: data.teamId,
      cardId: body.cardId,
      marked: body.marked,
    });

    // Diffusé, jamais retourné : Nest transformerait un retour {event, data} en
    // événement et non en accusé de réception. Le client écoute mark-changed.
    this.broadcaster.markChanged(data.gameId, data.teamId, {
      cardId: result.cardId,
      marked: result.marked,
      byGuestId: data.guestId ?? '',
    });
  }

  @SubscribeMessage('claim')
  async handleClaim(@ConnectedSocket() client: Socket): Promise<void> {
    const data = client.data as SocketData;
    if (data.gameId === undefined || data.teamId === undefined) return;

    const result = await this.claim.execute({ gameId: data.gameId, teamId: data.teamId });
    this.broadcaster.claimResult(data.gameId, data.teamId, result);
    if (result.valid) await this.broadcaster.gameFinished(data.gameId, data.teamId);
  }
}

function queryValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}
```

Les deux messages, `mark` et `claim`, figurent dans la matrice de permissions du manifeste sous `ws:mark` et `ws:claim`. En ajouter un troisième sans l y déclarer produirait un message qui ne passe jamais, sans erreur visible.

- [ ] **Étape 8 : écrire le test d intégration de la passerelle**

Ce test démarre un vrai serveur socket.io, comme celui du module hello écrit le 03/09. Il vérifie le contrat temps réel, pas la logique de jeu, déjà couverte.

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { LotoGateway } from './loto.gateway.js';

describe('LotoGateway (intégration)', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    // Le module de test fournit des cas d usage adossés aux dépôts factices :
    // on teste le contrat de transport, pas la persistance.
    const moduleRef = await Test.createTestingModule({
      providers: [LotoGateway /* + fabriques factices, cf. fake-repositories */],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    const address = app.getHttpServer().address();
    url = `http://localhost:${typeof address === 'object' && address !== null ? address.port : 0}`;
  });

  afterAll(async () => {
    await app.close();
  });

  function connect(auth: Record<string, unknown>, query: Record<string, string> = {}): ClientSocket {
    return io(`${url}/ws/loto`, { transports: ['websocket'], auth, query, forceNew: true });
  }

  it('émet state à la connexion, sans qu on ait à le demander', async () => {
    const socket = connect({ guestToken: 'jeton-invité-valide' });
    const state = await new Promise((resolve) => socket.once('state', resolve));
    expect(state).toHaveProperty('game');
    expect(state).toHaveProperty('tabla');
    socket.close();
  });

  it('répond à mark par un événement mark-changed, jamais par un accusé', async () => {
    const socket = connect({ guestToken: 'jeton-invité-valide' });
    await new Promise((resolve) => socket.once('state', resolve));

    const changed = new Promise((resolve) => socket.once('mark-changed', resolve));
    let ackCalled = false;
    socket.emit('mark', { cardId: 'c1', marked: true }, () => {
      ackCalled = true;
    });

    expect(await changed).toMatchObject({ cardId: 'c1', marked: true });
    expect(ackCalled).toBe(false);
    socket.close();
  });

  it('coupe une connexion sans identifiant de partie', async () => {
    const socket = connect({ token: 'jeton-utilisateur-valide' });
    await new Promise((resolve) => socket.once('disconnect', resolve));
    expect(socket.connected).toBe(false);
  });
});
```

L exécutant complétera le module de test avec les fabriques de `fake-repositories.ts` et un adaptateur de handshake factice qui pose `client.data`. Si le harnais s avère plus coûteux qu il n en a l air, le signaler plutôt que de le bâcler : le contrat temps réel du Lotería mérite un vrai test, et l E2E de la tâche 35 le couvre aussi de bout en bout.

- [ ] **Étape 9 : lancer le test**

Lancer : `pnpm --filter @quetzal/module-loto test:integration`
Attendu : les tests du dépôt et ceux de la passerelle passent.

- [ ] **Étape 10 : commit**

```bash
git add packages/module-loto/src/presentation/loto.gateway.integration.spec.ts
git commit -m "test(module-loto): contrat temps réel de la passerelle

Vérifie que mark répond par un événement et jamais par un accusé : Nest
transforme un retour {event, data} en événement, piège payé le 03/09."
git add packages/module-loto/src/presentation/loto.gateway.ts packages/module-loto/src/presentation/loto.broadcaster.ts
git commit -m "feat(module-loto): passerelle WebSocket et diffusion

Aucun message d entrée : un invité est affecté à son équipe à la connexion,
à partir de l identité posée au handshake. L écran joueur n a donc jamais de
fenêtre pendant laquelle il serait connecté sans tabla."
```

### Tâche 32 : Écran animateur

C est l écran projeté au tableau, lu depuis le fond de la salle. Tout y est plus gros que sur un écran de bureau, et rien n y est décoratif.

Première marche : `connectSocket` n accepte aujourd hui qu un jeton invité. L animatrice, elle, est authentifiée et doit dire **quelle** partie elle regarde — un utilisateur n a pas d identifiant de session dans son jeton, contrairement à un invité.

**Fichiers :**
- Modifier : `packages/core/src/client/socket.ts`
- Test : `packages/core/src/client/socket.spec.ts`
- Créer : `packages/module-loto/src/presentation/ui/animator-page.tsx`
- Créer : `packages/module-loto/src/presentation/ui/components/card-face.tsx`
- Créer : `packages/module-loto/src/presentation/ui/components/draw-ribbon.tsx`
- Créer : `packages/module-loto/src/presentation/ui/use-game-socket.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

`packages/core/src/client/socket.spec.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ioMock = vi.fn(() => ({ on: vi.fn(), emit: vi.fn() }));
vi.mock('socket.io-client', () => ({ io: ioMock }));
vi.mock('./api-client.js', () => ({ apiClient: () => ({ getToken: async () => 'jwt-de-test' }) }));

const { connectSocket } = await import('./socket.js');

describe('connectSocket', () => {
  beforeEach(() => ioMock.mockClear());

  it('transmet une query au handshake, pour dire quelle session on regarde', async () => {
    await connectSocket('ws/loto', { query: { gameId: 'game-1' } });
    expect(ioMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ query: { gameId: 'game-1' } }),
    );
  });

  it('n envoie aucune query quand il n y en a pas', async () => {
    await connectSocket('ws/loto');
    const options = ioMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(options['query']).toBeUndefined();
  });

  it('un jeton invité reste prioritaire sur le JWT', async () => {
    await connectSocket('ws/loto', { guestToken: 'jeton-invité' });
    const options = ioMock.mock.calls[0]?.[1] as { auth: Record<string, string> };
    expect(options.auth['guestToken']).toBe('jeton-invité');
    expect(options.auth['token']).toBeUndefined();
  });
});
```

Ce fichier emploie `vi.mock` sur `socket.io-client`, que CLAUDE.md paragraphe 11 proscrit. C est ici justifié et doit être signalé dans le corps du commit : ouvrir un vrai socket pour vérifier la forme des options du handshake reviendrait à tester socket.io. Le contrat temps réel réel, lui, est couvert par le test d intégration de la tâche 31 et par l E2E de la tâche 35.

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/core exec vitest run src/client/socket.spec.ts`
Attendu : ÉCHEC sur la première assertion, `query` absente des options.

- [ ] **Étape 3 : écrire l implémentation minimale**

```ts
import { io, type Socket } from 'socket.io-client';
import { socketUrl } from './api-url.js';
import { apiClient } from './api-client.js';

export interface ConnectSocketOptions {
  /** Entrée invité : jeton signé rendu par POST /api/guest-token. */
  guestToken?: string;
  /**
   * Paramètres de souscription passés au handshake. Un invité tient son
   * identifiant de session de son jeton ; un utilisateur authentifié, non, et
   * doit donc dire ce qu il regarde. Ce n est pas une revendication d identité :
   * le cloisonnement par locataire reste seul juge de ce qui est accessible.
   */
  query?: Record<string, string>;
}

/**
 * Ouvre une connexion socket.io vers le namespace d un module, sur l origine de
 * l API. L identité est résolue au handshake par l adaptateur de la plateforme :
 * `auth.token` pour un utilisateur, `auth.guestToken` pour un invité.
 */
export async function connectSocket(
  namespace: string,
  options: ConnectSocketOptions = {},
): Promise<Socket> {
  const auth: Record<string, string> = {};
  if (options.guestToken) {
    auth['guestToken'] = options.guestToken;
  } else {
    const token = await apiClient().getToken();
    if (token) auth['token'] = token;
  }
  return io(socketUrl(namespace), {
    auth,
    transports: ['websocket'],
    withCredentials: true,
    ...(options.query === undefined ? {} : { query: options.query }),
  });
}
```

Le commentaire d origine mentionnait `WsJwtGuard` et `WsGuestGuard`, supprimés le 03/09 quand l identité est passée au handshake. Il est corrigé au passage.

- [ ] **Étape 4 : lancer le test, reconstruire, commiter le noyau**

Lancer : `pnpm --filter @quetzal/core exec vitest run src/client/socket.spec.ts && pnpm --filter @quetzal/core build`
Attendu : `Tests 3 passed`, build silencieux.

```bash
git add packages/core/src/client/socket.spec.ts
git commit -m "test(core/client): connectSocket transmet une query de souscription

Emploie vi.mock sur socket.io-client, contre CLAUDE.md paragraphe 11 :
ouvrir un vrai socket pour vérifier la forme des options reviendrait à tester
socket.io. Le contrat temps réel est couvert par intégration et E2E."
git add packages/core/src/client/socket.ts
git commit -m "feat(core/client): query de souscription au handshake

Un invité tient son identifiant de session de son jeton, un utilisateur non.
Corrige au passage un commentaire qui citait deux gardes supprimées le 03/09."
```

- [ ] **Étape 5 : écrire le hook de connexion partagé**

`src/presentation/ui/use-game-socket.ts`, employé par les deux écrans :

```ts
'use client';
import { useEffect, useRef, useState } from 'react';
import { connectSocket } from '@quetzal/core/client';
import type { Socket } from 'socket.io-client';
import type { GameSnapshot } from '../../application/game-snapshot.use-case.js';

export interface GameSocketState {
  snapshot: GameSnapshot | null;
  error: string | null;
  socket: Socket | null;
}

export function useGameSocket(options: { gameId: string; guestToken?: string }): GameSocketState {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | null = null;

    void (async () => {
      socket = await connectSocket('ws/loto', {
        ...(options.guestToken === undefined
          ? { query: { gameId: options.gameId } }
          : { guestToken: options.guestToken }),
      });
      if (cancelled) {
        socket.disconnect();
        return;
      }
      socketRef.current = socket;
      force((n) => n + 1);

      // Un état complet arrive à chaque connexion ET à chaque reconnexion :
      // c est ce qui rend une coupure wifi invisible pour l élève.
      socket.on('state', (next: GameSnapshot) => setSnapshot(next));
      socket.on('join-failed', (payload: { reason: string }) => setError(payload.reason));

      socket.on('game-changed', (game: GameSnapshot['game']) =>
        setSnapshot((current) => (current === null ? current : { ...current, game })),
      );
      socket.on('card-drawn', (draw: { order: number; cardId: string; label: string }) =>
        setSnapshot((current) =>
          current === null
            ? current
            : {
                ...current,
                draws: [...current.draws, draw],
                game: {
                  ...current.game,
                  lastDrawOrder: draw.order,
                  remainingCardCount: current.game.remainingCardCount - 1,
                },
              },
        ),
      );
      socket.on('team-joined', (team: GameSnapshot['teams'][number]) =>
        setSnapshot((current) =>
          current === null
            ? current
            : {
                ...current,
                teams: [...current.teams.filter((t) => t.id !== team.id), team],
              },
        ),
      );
      socket.on('mark-changed', (payload: { cardId: string; marked: boolean }) =>
        setSnapshot((current) => {
          if (current === null || current.tabla === null) return current;
          const without = current.tabla.markedCardIds.filter((id) => id !== payload.cardId);
          return {
            ...current,
            tabla: {
              ...current.tabla,
              markedCardIds: payload.marked ? [...without, payload.cardId] : without,
            },
          };
        }),
      );
      socket.on('claim-result', (payload: { teamId: string; valid: boolean; blockedUntilDraw: number }) =>
        setSnapshot((current) => {
          if (current === null) return current;
          const tabla =
            current.tabla !== null && current.tabla.teamId === payload.teamId
              ? { ...current.tabla, blockedUntilDraw: payload.blockedUntilDraw }
              : current.tabla;
          return { ...current, tabla };
        }),
      );
      socket.on('game-finished', (payload: { wonByTeamId: string | null }) =>
        setSnapshot((current) =>
          current === null
            ? current
            : { ...current, game: { ...current.game, status: 'finished', wonByTeamId: payload.wonByTeamId } },
        ),
      );
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [options.gameId, options.guestToken]);

  return { snapshot, error, socket: socketRef.current };
}
```

- [ ] **Étape 6 : écrire les composants d affichage**

`src/presentation/ui/components/card-face.tsx` :

```tsx
'use client';

interface Props {
  label: string;
  imageId: string | null;
  marked?: boolean;
  size: 'sm' | 'lg' | 'xl';
  onClick?: () => void;
}

const SIZES = {
  sm: 'text-sm p-1 min-h-16',
  lg: 'text-2xl p-3 min-h-32',
  xl: 'text-6xl p-8 min-h-64',
} as const;

/**
 * Repli typographique : une carte sans image s affiche en toutes lettres. Le
 * jeu est donc pleinement jouable avant qu une seule image existe, ce qui rend
 * le développement indépendant de la production des visuels. Étape 6.
 */
export function CardFace({ label, imageId, marked = false, size, onClick }: Props) {
  const Tag = onClick === undefined ? 'div' : 'button';
  return (
    <Tag
      type={onClick === undefined ? undefined : 'button'}
      onClick={onClick}
      aria-pressed={onClick === undefined ? undefined : marked}
      className={`flex items-center justify-center rounded-lg border-2 text-center font-semibold transition ${SIZES[size]} ${
        marked ? 'border-primary bg-primary/20' : 'border-border bg-card'
      }`}
    >
      {imageId === null ? (
        <span>{label}</span>
      ) : (
        <img src={`/api/modules/loto/images/${imageId}`} alt={label} className="max-h-full object-contain" />
      )}
    </Tag>
  );
}
```

`src/presentation/ui/components/draw-ribbon.tsx` :

```tsx
'use client';
import { CardFace } from './card-face.js';

interface Props {
  draws: { order: number; cardId: string; label: string }[];
}

export function DrawRibbon({ draws }: Props) {
  return (
    <ol className="flex gap-2 overflow-x-auto pb-2" aria-label="Cartes déjà sorties">
      {draws.map((draw) => (
        <li key={draw.cardId} className="shrink-0 w-20">
          <CardFace label={draw.label} imageId={null} size="sm" />
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Étape 7 : écrire l écran animateur**

`src/presentation/ui/animator-page.tsx` :

```tsx
'use client';
import { useTranslations } from 'next-intl';
import { apiClient } from '@quetzal/core/client';
import { Button, Card } from '@quetzal/ui';
import { CardFace } from './components/card-face.js';
import { DrawRibbon } from './components/draw-ribbon.js';
import { useGameSocket } from './use-game-socket.js';

interface Props {
  gameId: string;
  hostUrl: string;
}

export default function AnimatorPage({ gameId, hostUrl }: Props) {
  const t = useTranslations('module.loto');
  const { snapshot, error } = useGameSocket({ gameId });

  if (error !== null) return <p role="alert">{error}</p>;
  if (snapshot === null) return <p>{t('game.waiting')}</p>;

  const { game, teams, draws } = snapshot;
  const lastDraw = draws[draws.length - 1];
  const joinUrl = `${hostUrl}/j/loto/${game.id}`;

  async function post(path: string): Promise<void> {
    await apiClient().apiFetch(`/api/modules/loto/games/${gameId}/${path}`, { method: 'POST' });
  }

  if (game.status === 'draft' || game.status === 'open') {
    return (
      <Card className="p-8 space-y-8">
        <div className="text-center">
          <p className="text-2xl">{t('game.joinCode')}</p>
          <p className="text-8xl font-bold tracking-widest" data-testid="join-code">
            {game.joinCode}
          </p>
          <p className="mt-4 break-all text-sm text-muted-foreground">{joinUrl}</p>
        </div>

        <ul className="flex flex-wrap gap-3" data-testid="teams">
          {teams.map((team) => (
            <li key={team.id} className="rounded-lg border px-4 py-2 text-xl">
              {team.name.kind === 'member' ? team.name.displayName : t('team.numbered', { number: team.name.number })}
              {team.memberCount > 1 ? ` (${String(team.memberCount)})` : ''}
            </li>
          ))}
        </ul>

        <div className="flex gap-3">
          {game.status === 'draft' ? (
            <Button size="lg" onClick={() => void post('open')}>{t('game.open')}</Button>
          ) : (
            <Button size="lg" onClick={() => void post('draw')} data-testid="draw">{t('game.draw')}</Button>
          )}
          <Button size="lg" variant="outline" onClick={() => void post('finish')}>{t('game.finish')}</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-8 space-y-6">
      {lastDraw !== undefined && (
        <div className="text-center" data-testid="last-draw">
          <CardFace label={lastDraw.label} imageId={null} size="xl" />
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button size="lg" disabled={game.status === 'finished'} onClick={() => void post('draw')} data-testid="draw">
          {t('game.draw')}
        </Button>
        <p className="text-xl">{t('game.remaining', { count: game.remainingCardCount })}</p>
        <Button size="lg" variant="outline" onClick={() => void post('finish')}>{t('game.finish')}</Button>
      </div>

      <DrawRibbon draws={draws} />

      {game.status === 'finished' && (
        <p className="text-4xl font-bold text-center" role="status" data-testid="winner">
          {game.wonByTeamId === null
            ? t('game.stopped')
            : t('game.wonBy', {
                team: nameOf(teams, game.wonByTeamId, t),
              })}
        </p>
      )}
    </Card>
  );
}

function nameOf(
  teams: { id: string; name: { kind: 'member'; displayName: string } | { kind: 'numbered'; number: number } }[],
  teamId: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const team = teams.find((candidate) => candidate.id === teamId);
  if (team === undefined) return '';
  return team.name.kind === 'member' ? team.name.displayName : t('team.numbered', { number: team.name.number });
}
```

- [ ] **Étape 8 : vérifier**

Lancer : `pnpm --filter @quetzal/module-loto typecheck && pnpm --filter @quetzal/module-loto lint`
Attendu : aucune sortie. Si ESLint se plaint d une chaîne littérale dans du JSX, c est la règle `react/jsx-no-literals` : la chaîne doit passer par une clé de traduction.

- [ ] **Étape 9 : commit**

```bash
git add packages/module-loto/src/presentation/ui
git commit -m "feat(module-loto): écran animateur

Écran projeté, lu depuis le fond de la salle. Le repli typographique de
CardFace rend le jeu pleinement jouable avant qu une seule image existe.

Exempté du cycle test-first au titre de CLAUDE.md paragraphe 5, couche
Presentation ; couvert par l E2E de la tâche 35."
```

### Tâche 33 : Écran joueur

Un téléphone, une colonne, rien d autre. La carte tirée en haut, la tabla dessous, le marquage au doigt, un bouton de réclamation.

**Fichiers :**
- Créer : `packages/module-loto/src/presentation/ui/guest-join.tsx`
- Créer : `packages/module-loto/src/presentation/ui/components/tabla-grid.tsx`

- [ ] **Étape 1 : écrire la grille**

`src/presentation/ui/components/tabla-grid.tsx` :

```tsx
'use client';
import { CardFace } from './card-face.js';

interface Props {
  cards: { id: string; label: string; imageId: string | null }[];
  markedCardIds: string[];
  onToggle: (cardId: string, marked: boolean) => void;
  disabled: boolean;
}

export function TablaGrid({ cards, markedCardIds, onToggle, disabled }: Props) {
  const marked = new Set(markedCardIds);
  return (
    <div className="grid grid-cols-4 gap-1.5" data-testid="tabla">
      {cards.map((card) => {
        const isMarked = marked.has(card.id);
        return (
          <CardFace
            key={card.id}
            label={card.label}
            imageId={card.imageId}
            marked={isMarked}
            size="lg"
            onClick={disabled ? undefined : () => onToggle(card.id, !isMarked)}
          />
        );
      })}
    </div>
  );
}
```

Quatre colonnes, seize cases : la grille est la tabla, l ordre du tableau est celui de la tabla. Aucun tri ici, sinon la projection en grille du domaine et l affichage divergeraient et une figure validée par le serveur n aurait pas l air gagnante à l écran.

- [ ] **Étape 2 : écrire l écran joueur**

`src/presentation/ui/guest-join.tsx` :

```tsx
'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, Input, Label } from '@quetzal/ui';
import { TablaGrid } from './components/tabla-grid.js';
import { CardFace } from './components/card-face.js';
import { useGameSocket } from './use-game-socket.js';

interface Props {
  tenantId: string;
  moduleSlug: string;
  sessionId: string;
}

interface TokenResponse {
  token: string;
}

export default function GuestJoin({ tenantId, moduleSlug, sessionId }: Props) {
  const t = useTranslations('module.loto');
  const tGuest = useTranslations('guest.join');
  const [displayName, setDisplayName] = useState('');
  const [guestToken, setGuestToken] = useState<string | undefined>(undefined);
  const [tokenError, setTokenError] = useState<string | null>(null);

  async function onJoin(event: React.FormEvent) {
    event.preventDefault();
    setTokenError(null);
    const res = await fetch('/api/guest-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, moduleSlug, sessionId, displayName }),
    });
    if (!res.ok) {
      setTokenError(String(res.status));
      return;
    }
    const { token } = (await res.json()) as TokenResponse;
    setGuestToken(token);
  }

  if (guestToken === undefined) {
    return (
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-4 text-xl font-semibold">{t('nav.title')}</h1>
        <form onSubmit={onJoin} className="space-y-4">
          <div>
            <Label htmlFor="displayName">{tGuest('display_name')}</Label>
            <Input
              id="displayName"
              required
              maxLength={32}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          {tokenError !== null && <p role="alert">{tokenError}</p>}
          <Button type="submit" className="w-full">{tGuest('join')}</Button>
        </form>
      </Card>
    );
  }

  return <PlayerBoard gameId={sessionId} guestToken={guestToken} />;
}

function PlayerBoard({ gameId, guestToken }: { gameId: string; guestToken: string }) {
  const t = useTranslations('module.loto');
  const { snapshot, error, socket } = useGameSocket({ gameId, guestToken });
  const [rejected, setRejected] = useState(false);

  if (error !== null) return <p role="alert">{error}</p>;
  if (snapshot === null || snapshot.tabla === null) return <p>{t('player.waiting')}</p>;

  const { game, draws, tabla } = snapshot;
  const lastDraw = draws[draws.length - 1];
  const blocked = tabla.blockedUntilDraw > game.lastDrawOrder;

  function toggle(cardId: string, marked: boolean): void {
    socket?.emit('mark', { cardId, marked });
  }

  function claim(): void {
    setRejected(false);
    socket?.emit('claim');
    // La réponse arrive par l événement claim-result, jamais par un accusé :
    // Nest transforme un retour {event, data} en événement.
    socket?.once('claim-result', (payload: { valid: boolean }) => setRejected(!payload.valid));
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-3 p-3">
      {lastDraw !== undefined && <CardFace label={lastDraw.label} imageId={null} size="lg" />}

      <TablaGrid
        cards={tabla.cards}
        markedCardIds={tabla.markedCardIds}
        onToggle={toggle}
        disabled={game.status === 'finished'}
      />

      <Button
        size="lg"
        className="h-16 text-2xl"
        disabled={blocked || game.status !== 'running'}
        onClick={claim}
        data-testid="claim"
      >
        {t('player.claim')}
      </Button>

      {blocked && <p role="status">{t('player.blocked', { draw: tabla.blockedUntilDraw })}</p>}
      {rejected && !blocked && <p role="alert">{t('player.rejected')}</p>}
      {game.status === 'finished' && (
        <p role="status" data-testid="finished">
          {game.wonByTeamId === tabla.teamId ? t('game.wonBy', { team: '' }) : t('game.stopped')}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Étape 3 : vérifier**

Lancer : `pnpm --filter @quetzal/module-loto typecheck && pnpm --filter @quetzal/module-loto lint && pnpm --filter @quetzal/module-loto test`
Attendu : aucune erreur, et le compte de tests unitaires inchangé.

- [ ] **Étape 4 : commit**

```bash
git add packages/module-loto/src/presentation/ui/guest-join.tsx packages/module-loto/src/presentation/ui/components/tabla-grid.tsx
git commit -m "feat(module-loto): écran joueur

Une colonne, la carte tirée, la tabla, un bouton. La grille suit l ordre de
la tabla sans le retrier : sinon la projection du domaine et l affichage
divergeraient et une figure validée n aurait pas l air gagnante.

Exempté du cycle test-first au titre de CLAUDE.md paragraphe 5, couche
Presentation ; couvert par l E2E de la tâche 35."
```

**Fin de l étape 3.**

- [ ] Lancer : `pnpm --filter @quetzal/module-loto typecheck && pnpm --filter @quetzal/module-loto lint`
      Attendu : aucune sortie.
- [ ] Lancer : `pnpm --filter @quetzal/module-loto test && pnpm --filter @quetzal/module-loto test:integration`
      Attendu : tout vert, suite de contrat comprise.
- [ ] Lancer : `grep -rn "rooms.session\|rooms.subgroup" packages/module-loto/src/ | grep -v spec`
      Attendu : uniquement `loto.gateway.ts` et `loto.broadcaster.ts`. Aucune chaîne de salon écrite à la main ailleurs.
- [ ] Lancer : `grep -rn "@nestjs" packages/module-loto/src/presentation/ui/`
      Attendu : aucune correspondance. Les composants d écran sont bundlés par Next et ne doivent jamais tirer NestJS.

## Étape 4 — Partie jouable

But de l étape : **la première séance en classe devient possible**. Le module est activé pour le locataire, le jeu traditionnel est en base, et une partie entière se joue avec les cinquante-quatre cartes en noms seuls.

C est le point d arrêt propre du sous-projet. Si la préparation de la certification d octobre reprend la main ici, ce qui est livré est utilisable tel quel.

### Tâche 34 : Câblage et amorçage

**Fichiers :**
- Créer : `packages/module-loto/scripts/seed-loto.ts`
- Modifier : `packages/module-loto/package.json`
- Modifier : `.github/workflows/ci.yml`
- Modifier : `render.yaml`
- Modifier : `apps/host/vercel.json` (rien à changer si `MODULES` y est déjà une variable)

- [ ] **Étape 1 : déclarer le module dans les variables d environnement locales**

Dans `.env.local` à la racine, faire passer les deux listes de modules de `hello` à `hello,loto` :

```
MODULES=hello,loto
NEXT_PUBLIC_MODULES=hello,loto
```

Piège rappelé du 03/09 : `generate:routes` ne lit pas `.env.local`. En local, passer la variable explicitement :

Lancer : `NEXT_PUBLIC_MODULES=hello,loto pnpm --filter @quetzal/core generate:routes`
Attendu : `module-loaders.generated.ts` mentionne désormais `@quetzal/module-loto/client`.

Et ne jamais lancer `turbo run typecheck` pendant un `next build` : le `pretypecheck` du host efface les routes générées.

- [ ] **Étape 2 : déclarer la dépendance de l API sur le module**

`apps/api` charge les modules par import dynamique. Sans dépendance déclarée, la résolution Node échoue sur Render en pnpm strict — la leçon a coûté la PR n°12 au sous-projet 1.

Dans `apps/api/package.json`, ajouter aux dépendances :

```json
    "@quetzal/module-loto": "workspace:*"
```

Lancer : `pnpm install`
Attendu : `Done in ...`.

- [ ] **Étape 3 : écrire le script d amorçage**

`packages/module-loto/scripts/seed-loto.ts` :

```ts
import { rootPrisma, newId } from '@quetzal/db';
import { TRADITIONAL_CARDS, TRADITIONAL_DECK_NAME } from '../src/infrastructure/traditional-deck.js';

/**
 * Idempotent : relancé sur une base déjà amorcée, il ne crée aucun doublon.
 * C est la même exigence que le seed du noyau, et pour la même raison — il
 * tourne à chaque déploiement.
 */
async function main(): Promise<void> {
  const tenantSlug = process.env['SEED_TENANT_SLUG'] ?? 'default';
  const organization = await rootPrisma.organization.findFirst({ where: { slug: tenantSlug } });
  if (organization === null) throw new Error(`Locataire introuvable : ${tenantSlug}`);

  const owner = await rootPrisma.member.findFirst({ where: { organizationId: organization.id } });
  if (owner === null) throw new Error(`Aucun membre dans le locataire ${tenantSlug}`);

  await rootPrisma.tenantModule.upsert({
    where: { tenantId_moduleSlug: { tenantId: organization.id, moduleSlug: 'loto' } },
    create: { tenantId: organization.id, moduleSlug: 'loto', enabled: true },
    update: { enabled: true },
  });

  const existing = await rootPrisma.loto_Deck.findFirst({
    where: { tenantId: organization.id, isTemplate: true, name: TRADITIONAL_DECK_NAME },
  });
  if (existing !== null) {
    console.log(`[seed:loto] modèle déjà présent (${existing.id})`);
    return;
  }

  const deckId = newId();
  await rootPrisma.loto_Deck.create({
    data: {
      id: deckId,
      tenantId: organization.id,
      name: TRADITIONAL_DECK_NAME,
      isTemplate: true,
      createdBy: owner.userId,
    },
  });
  await rootPrisma.loto_Card.createMany({
    data: TRADITIONAL_CARDS.map((card) => ({
      id: newId(),
      tenantId: organization.id,
      deckId,
      rank: card.rank,
      label: card.label,
      imageId: null,
    })),
  });

  console.log(`[seed:loto] ${String(TRADITIONAL_CARDS.length)} cartes créées (${deckId})`);
}

await main();
await rootPrisma.$disconnect();
```

Ce script emploie `rootPrisma` et non le client cloisonné : c est un script d administration du noyau, pas du code de module au sens de CLAUDE.md paragraphe 3. Il écrit `tenantId` à la main **parce qu il tourne hors requête**, ce qui est précisément le cas que l extension de cloisonnement ne couvre pas.

Ajouter le script dans `packages/module-loto/package.json` :

```json
    "seed": "node --env-file=../../.env.local --experimental-strip-types scripts/seed-loto.ts"
```

- [ ] **Étape 4 : appliquer la migration et amorcer**

Lancer : `pnpm --filter @quetzal/db prisma migrate deploy && pnpm --filter @quetzal/module-loto seed`
Attendu : `54 cartes créées (...)`. Relancer une seconde fois et vérifier : `modèle déjà présent`.

- [ ] **Étape 5 : lancer la plateforme et vérifier à la main**

Lancer : `pnpm dev`

Vérifier dans l ordre, et **noter le résultat réel de chaque point** :

1. La barre latérale affiche « Lotería », avec le vrai libellé et non `module.loto.nav.title`. Si la clé brute s affiche, les catalogues fusionnés n ont pas été régénérés : c est le bug du 03/09, relancer le `prebuild` d i18n.
2. La page du module liste le jeu « Lotería tradicional », 54 cartes.
3. Créer une partie, figure `linea`, six équipes, pénalité trois.
4. L écran animateur affiche un code d entrée de six caractères, sans O, 0, I, 1 ni L.
5. Ouvrir la salle. Sur un téléphone du même réseau, aller à `/j/loto/<id>`, saisir un prénom, valider.
6. Le téléphone affiche une tabla de seize cartes. L écran animateur affiche l équipe qui vient d entrer.
7. Tirer une carte. Elle apparaît en grand sur l écran animateur et en haut du téléphone.
8. Marquer une case sur le téléphone. Elle change d aspect.
9. Réclamer trop tôt. La réclamation est refusée et le bouton se bloque pour trois tirages.
10. Tirer jusqu à compléter une ligne de la tabla, réclamer. La partie s arrête, l équipe gagnante s affiche des deux côtés.

- [ ] **Étape 6 : déclarer le module dans la CI et en production**

Dans `.github/workflows/ci.yml`, les deux variables de niveau workflow passent à `hello,loto` :

```yaml
env:
  MODULES: hello,loto
  NEXT_PUBLIC_MODULES: hello,loto
```

Dans `render.yaml`, la variable `MODULES` du service `quetzal-api` passe à `hello,loto`.

Côté tableaux de bord, à faire par Sylvain et non par un agent :
- Vercel, projet du host : `MODULES` et `NEXT_PUBLIC_MODULES` à `hello,loto`, puis redéployer.
- Render, service `quetzal-api` : `MODULES` à `hello,loto`.
- Après déploiement, lancer le seed une fois contre la base de production.

- [ ] **Étape 7 : commit**

```bash
git add packages/module-loto/scripts packages/module-loto/package.json apps/api/package.json pnpm-lock.yaml .github/workflows/ci.yml render.yaml
git commit -m "feat(module-loto): câblage et amorçage du jeu traditionnel

Le module est déclaré dans les deux listes, l API dépend explicitement du
paquet — sans quoi la résolution Node échoue sur Render en pnpm strict — et
le seed pose le modèle de 54 cartes de façon idempotente.

Exempté du cycle test-first au titre de CLAUDE.md paragraphe 5, scripts et
configuration ; la vérification est l exécution, couverte par l E2E suivant."
```

### Tâche 35 : E2E du parcours invité par QR code

Ce test solde le point laissé en réserve à la fermeture de la dette du sous-projet 1 : le parcours invité complet n avait jamais été couvert, le smoke E2E ne couvrant que l utilisateur connecté. Le Lotería est le premier module à en faire un vrai usage.

La brique technique existe déjà : `connectSocket(ns, { guestToken })` côté client, et le refus d un jeton invité émis pour un autre module côté serveur.

**Fichiers :**
- Créer : `e2e/tests/loto-guest.e2e.spec.ts`

- [ ] **Étape 1 : écrire le test**

```ts
import { test, expect, type Page } from '@playwright/test';

const OWNER_EMAIL = process.env['SEED_OWNER_EMAIL'] ?? '';
const OWNER_PASSWORD = process.env['SEED_OWNER_PASSWORD'] ?? '';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/e-?mail/i).fill(OWNER_EMAIL);
  await page.getByLabel(/mot de passe|password/i).fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: /connexion|sign in/i }).click();
  await expect(page).toHaveURL(/dashboard/);
}

test('une partie entière, de la création à la victoire d un invité', async ({ page, browser }) => {
  test.slow();

  await login(page);

  // L animatrice crée une partie sur le jeu traditionnel.
  await page.getByRole('link', { name: 'Lotería' }).click();
  await page.getByRole('button', { name: /nouvelle partie|new game/i }).click();
  await page.getByRole('button', { name: /ouvrir la salle|open the room/i }).click();

  const joinCode = await page.getByTestId('join-code').innerText();
  expect(joinCode).toHaveLength(6);
  expect(joinCode).not.toMatch(/[O0I1L]/);

  const gameId = page.url().split('/').pop() ?? '';
  expect(gameId).not.toBe('');

  // Un élève entre par l adresse que porte le QR code, sur un autre contexte
  // de navigateur : pas de cookie de session, exactement comme un téléphone.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/j/loto/${gameId}`);
  await guest.getByLabel(/nom|name/i).fill('Ana');
  await guest.getByRole('button', { name: /rejoindre|join/i }).click();

  // Le socket est authentifié par le jeton invité, et la tabla arrive sans
  // qu on ait rien demandé : l affectation se fait au handshake.
  const tabla = guest.getByTestId('tabla');
  await expect(tabla).toBeVisible();
  await expect(tabla.locator('button')).toHaveCount(16);

  // L animatrice voit l équipe arriver, en temps réel.
  await expect(page.getByTestId('teams')).toContainText('Ana');

  // Une réclamation prématurée est refusée.
  await guest.getByTestId('claim').click();
  await expect(guest.getByRole('alert')).toBeVisible();

  // L animatrice tire jusqu à ce que la partie soit gagnée ou le jeu épuisé.
  for (let i = 0; i < 54; i++) {
    if (await page.getByTestId('winner').isVisible()) break;
    await page.getByTestId('draw').click();
    await guest.waitForTimeout(50);
    const claim = guest.getByTestId('claim');
    if (await claim.isEnabled()) {
      await claim.click();
      await guest.waitForTimeout(100);
    }
  }

  await expect(page.getByTestId('winner')).toBeVisible();
  await expect(guest.getByTestId('finished')).toBeVisible();

  await guestContext.close();
});
```

La boucle réclame à chaque tirage plutôt que de calculer quand la figure est complète. C est volontaire : le test ne doit pas réimplémenter la règle qu il vérifie. Chaque réclamation infructueuse est refusée par le serveur, et la pénalité de la partie créée par défaut est à zéro — vérifier que le formulaire de création laisse bien la pénalité à zéro, sinon la boucle se bloquerait elle-même.

- [ ] **Étape 2 : lancer le test**

Lancer : `pnpm exec playwright test e2e/tests/loto-guest.e2e.spec.ts`
Attendu : le test passe. Reporter le temps réel : ce parcours est long, et s il dépasse largement la minute il faut le dire plutôt que d augmenter les délais d attente.

- [ ] **Étape 3 : commit**

```bash
git add e2e/tests/loto-guest.e2e.spec.ts
git commit -m "test(e2e): parcours invité complet du Lotería

Solde le point laissé en réserve à la fermeture de la dette du sous-projet 1 :
scan du QR, formulaire de nom, jeton invité, socket authentifié, tabla reçue
au handshake, réclamation refusée puis victoire. Le smoke existant ne
couvrait que l utilisateur connecté."
```

**Fin de l étape 4. Le module est utilisable en classe.**

- [ ] Lancer : `pnpm --filter @quetzal/module-loto test && pnpm --filter @quetzal/module-loto test:integration`
- [ ] Lancer : `pnpm exec playwright test`
      Attendu : le smoke du sous-projet 1 et le parcours invité passent tous deux.
- [ ] Lancer : `pnpm turbo run build lint typecheck`
      Attendu : tout vert. Penser à `NEXT_PUBLIC_MODULES=hello,loto` si la map de loaders sort vide.
- [ ] Ouvrir une PR. Les deux étapes restantes, éditeur de jeux et images, peuvent attendre : ce qui est là se joue.

## Étape 5 — Éditeur de jeux de cartes

But de l étape : Elda compose ses propres jeux. C est la valeur pédagogique durable du module — un jeu de vocabulaire sur le thème du moment vaut plus, en cours d espagnol, que la lotería traditionnelle jouée pour la dixième fois.

### Tâche 36 : Écran de gestion des jeux

**Fichiers :**
- Créer : `packages/module-loto/src/presentation/ui/decks-page.tsx`
- Modifier : `packages/module-loto/src/client.ts`

- [ ] **Étape 1 : écrire l écran**

`src/presentation/ui/decks-page.tsx` :

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient } from '@quetzal/core/client';
import { Button, Card, Input } from '@quetzal/ui';

interface DeckSummary {
  id: string;
  name: string;
  isTemplate: boolean;
  cardCount: number;
}

const MIN_PLAYABLE = 16;

export default function DecksPage() {
  const t = useTranslations('module.loto.decks');
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await apiClient().apiFetch('/api/modules/loto/decks');
    if (!res.ok) return;
    const data = (await res.json()) as { decks: DeckSummary[] };
    setDecks(data.decks);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function send(path: string, init: RequestInit): Promise<void> {
    setError(null);
    const res = await apiClient().apiFetch(path, init);
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? String(res.status));
      return;
    }
    await reload();
  }

  async function duplicate(deck: DeckSummary): Promise<void> {
    await send('/api/modules/loto/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `${deck.name} (copie)`, duplicateOf: deck.id }),
    });
  }

  async function createBlank(): Promise<void> {
    if (newName.trim() === '') return;
    await send('/api/modules/loto/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    setNewName('');
  }

  async function remove(deck: DeckSummary): Promise<void> {
    // La suppression emporte l historique des parties liées. L avertissement
    // est explicite parce que l action est définitive, cascade comprise.
    if (!window.confirm(t('deleteWarning'))) return;
    await send(`/api/modules/loto/decks/${deck.id}`, { method: 'DELETE' });
  }

  return (
    <Card className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {error !== null && <p role="alert">{error === 'deck_locked' ? t('locked') : error}</p>}

      {decks.length === 0 && <p>{t('empty')}</p>}

      <ul className="space-y-2" data-testid="decks">
        {decks.map((deck) => (
          <li key={deck.id} className="flex items-center gap-3 rounded-lg border p-3">
            <span className="flex-1 font-medium">{deck.name}</span>
            <span className={deck.cardCount < MIN_PLAYABLE ? 'text-destructive' : undefined}>
              {t('cardCount', { count: deck.cardCount })}
              {deck.cardCount < MIN_PLAYABLE ? ` · ${t('tooSmall')}` : ''}
            </span>
            <Button variant="outline" onClick={() => void duplicate(deck)}>{t('duplicate')}</Button>
            {!deck.isTemplate && (
              <Button variant="destructive" onClick={() => void remove(deck)}>{t('delete')}</Button>
            )}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Input value={newName} maxLength={120} onChange={(event) => setNewName(event.target.value)} />
        <Button onClick={() => void createBlank()}>{t('createBlank')}</Button>
      </div>
    </Card>
  );
}
```

Le modèle livré n a pas de bouton de suppression : c est le point de départ de toute duplication, et le perdre obligerait à réamorcer la base.

- [ ] **Étape 2 : déclarer la route d édition dans le manifeste client**

Dans `src/client.ts`, ajouter une troisième route :

```ts
    {
      path: 'decks/:deckId',
      component: () => import('./presentation/ui/deck-editor.js'),
      requiredRoles: ['owner', 'creator'],
      layout: 'shell',
    },
```

- [ ] **Étape 3 : vérifier et commiter**

Lancer : `pnpm --filter @quetzal/module-loto typecheck && pnpm --filter @quetzal/module-loto lint && pnpm --filter @quetzal/module-loto exec vitest run tests/manifest.spec.ts`
Attendu : aucune erreur, suite de contrat verte.

```bash
git add packages/module-loto/src/presentation/ui/decks-page.tsx packages/module-loto/src/client.ts
git commit -m "feat(module-loto): écran de gestion des jeux de cartes

Le modèle livré n a pas de bouton de suppression : c est le point de départ
de toute duplication.

Exempté du cycle test-first au titre de CLAUDE.md paragraphe 5, couche
Presentation."
```

### Tâche 37 : Éditeur d un jeu de cartes

**Fichiers :**
- Créer : `packages/module-loto/src/presentation/ui/deck-editor.tsx`

- [ ] **Étape 1 : écrire l éditeur**

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient } from '@quetzal/core/client';
import { Button, Card, Input } from '@quetzal/ui';

interface DeckCard {
  id: string;
  rank: number;
  label: string;
  imageId: string | null;
}

interface Deck {
  id: string;
  name: string;
  isTemplate: boolean;
  cardCount: number;
  cards: DeckCard[];
}

const MIN_PLAYABLE = 16;

export default function DeckEditor({ deckId }: { deckId: string }) {
  const t = useTranslations('module.loto.decks');
  const [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await apiClient().apiFetch(`/api/modules/loto/decks/${deckId}`);
    if (!res.ok) return;
    setDeck((await res.json()) as Deck);
  }, [deckId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function patch(body: unknown): Promise<void> {
    setError(null);
    const res = await apiClient().apiFetch(`/api/modules/loto/decks/${deckId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = (await res.json()) as { error?: string };
      setError(payload.error ?? String(res.status));
      return;
    }
    await reload();
  }

  if (deck === null) return null;

  return (
    <Card className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Input
          defaultValue={deck.name}
          maxLength={120}
          onBlur={(event) => void patch({ name: event.target.value })}
        />
        <span className={deck.cards.length < MIN_PLAYABLE ? 'text-destructive' : undefined}>
          {t('cardCount', { count: deck.cards.length })}
          {deck.cards.length < MIN_PLAYABLE ? ` · ${t('tooSmall')}` : ''}
        </span>
      </div>

      {error !== null && <p role="alert">{error === 'deck_locked' ? t('locked') : error}</p>}

      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="deck-cards">
        {deck.cards.map((card) => (
          <li key={card.id} className="space-y-2 rounded-lg border p-2">
            <span className="text-xs text-muted-foreground">{card.rank}</span>
            <Input
              defaultValue={card.label}
              maxLength={80}
              onBlur={(event) => void patch({ card: { rank: card.rank, label: event.target.value } })}
            />
          </li>
        ))}
      </ol>

      <Button onClick={() => void patch({ card: { rank: deck.cards.length + 1, label: '' } })}>
        {t('createBlank')}
      </Button>
    </Card>
  );
}
```

L édition se déclenche au `blur` et non à chaque frappe : une requête par caractère saturerait le wifi de l établissement, et le verrou de la décision D5 renverrait alors une erreur par caractère plutôt qu une.

L ajout d une carte réutilise `PATCH` avec un rang qui n existe pas encore. Le dépôt de la tâche 14 fait un `updateMany` qui ne touche rien dans ce cas : **cette route ne crée pas encore de carte**. C est une limite connue de l éditeur à ce stade, à traiter par une route dédiée `POST /decks/:id/cards` si Elda a besoin de partir d un jeu vierge plutôt que d une duplication. Le noter dans la dette plutôt que de l improviser ici.

- [ ] **Étape 2 : ajouter la route de lecture d un jeu**

L éditeur lit `GET /api/modules/loto/decks/:id`, qui n existe pas encore. Dans `deck.controller.ts` :

```ts
  @Get(':id')
  async read(@Param('id') id: string) {
    const deck = await this.decks.findOne({ deckId: id });
    return deck;
  }
```

Et dans `manage-decks.use-case.ts` :

```ts
  async findOne(input: { deckId: string }): Promise<Deck> {
    return this.require(input.deckId);
  }
```

Ajouter la permission correspondante dans `manifest.ts` :

```ts
    'http:GET /api/modules/loto/decks/:id': ['owner', 'creator'],
```

- [ ] **Étape 3 : vérifier et commiter**

Lancer : `pnpm --filter @quetzal/module-loto typecheck && pnpm --filter @quetzal/module-loto lint && pnpm --filter @quetzal/module-loto test`
Attendu : aucune erreur, tests unitaires au même compte qu avant.

```bash
git add packages/module-loto/src/presentation/ui/deck-editor.tsx packages/module-loto/src/presentation/deck.controller.ts packages/module-loto/src/application/manage-decks.use-case.ts packages/module-loto/src/manifest.ts
git commit -m "feat(module-loto): éditeur d un jeu de cartes

Édition au blur et non à chaque frappe : une requête par caractère saturerait
le wifi d établissement, et le verrou D5 renverrait une erreur par caractère.

L ajout d une carte à un jeu vierge n est pas encore possible : PATCH ne crée
pas de rang inexistant. Tracé en dette."
```

**Fin de l étape 5.**

- [ ] Vérifier à la main : dupliquer la lotería traditionnelle, renommer trois cartes dans la copie, revenir sur le modèle et constater qu il n a pas bougé.
- [ ] Vérifier à la main : ouvrir une partie sur un jeu, puis tenter de renommer ce jeu. L écran doit afficher le message de verrou et non une erreur brute.

### Tâche 38 : Historique et création de partie

Deux manques que la relecture du plan a fait apparaître. Le manifeste déclare `http:GET /api/modules/loto/games`, mais aucune route ne la sert : la matrice de permissions mentirait. Et rien, dans les écrans, ne crée de partie — l écran animateur suppose une partie déjà là, alors que l E2E de la tâche 35 clique sur « Nouvelle partie ».

L historique des parties est au périmètre, section 3.1 de la spec. Il n a pas de valeur décorative : c est ce qui permet à Elda de rouvrir l écran d une partie de la veille pour retrouver qui avait gagné.

**Fichiers :**
- Modifier : `packages/module-loto/src/domain/ports/game.repository.ts`
- Modifier : `packages/module-loto/src/infrastructure/prisma-game.repository.ts`
- Test : `packages/module-loto/src/infrastructure/prisma-game.repository.integration.spec.ts`
- Créer : `packages/module-loto/src/application/list-games.use-case.ts`
- Test : `packages/module-loto/src/application/list-games.use-case.spec.ts`
- Modifier : `packages/module-loto/src/presentation/game.controller.ts`
- Modifier : `packages/module-loto/src/loto.module.ts`
- Modifier : `packages/module-loto/src/presentation/ui/decks-page.tsx`

- [ ] **Étape 1 : ajouter le type et la méthode au port**

Dans `game.repository.ts` :

```ts
export interface GameSummary {
  id: string;
  deckId: string;
  status: GameStatus;
  pattern: PatternKey;
  joinCode: string;
  createdAt: Date;
  wonByTeamId: string | null;
}
```

et dans l interface `GameRepository` :

```ts
  /** Historique du locataire, la plus récente d abord. */
  list(): Promise<GameSummary[]>;
```

- [ ] **Étape 2 : écrire le test d intégration qui échoue**

À ajouter dans `prisma-game.repository.integration.spec.ts` :

```ts
  it('liste les parties du locataire, la plus récente d abord', async () => {
    const { tenantId, ownerId, games, deck } = await aGame();
    await inTenant(tenantId, ownerId, () =>
      games.create({ deckId: deck.id, createdBy: ownerId, joinCode: 'ZZZ999', settings: { ...SETTINGS } }),
    );

    const list = await inTenant(tenantId, ownerId, () => games.list());

    expect(list).toHaveLength(2);
    expect(list[0]?.joinCode).toBe('ZZZ999');
    expect(list[0]?.createdAt.getTime()).toBeGreaterThanOrEqual(list[1]!.createdAt.getTime());
  });

  it('ne liste jamais les parties d un autre locataire', async () => {
    await aGame();
    const other = await seedTenant();
    const games = new PrismaGameRepository();

    const list = await inTenant(other.tenantId, other.ownerId, () => games.list());
    expect(list).toEqual([]);
  });
```

- [ ] **Étape 3 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto test:integration`
Attendu : ÉCHEC, `games.list is not a function`.

- [ ] **Étape 4 : écrire l implémentation du dépôt**

Élargir `GameRow` avec `createdAt: Date`, ajouter `findMany` au type `loto_Game` de `PrismaWithLoto` :

```ts
    findMany(args: { orderBy: Record<string, unknown> }): Promise<GameRow[]>;
```

puis la méthode :

```ts
  async list(): Promise<GameSummary[]> {
    const rows = await this.prisma.loto_Game.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.flatMap((row) => {
      if (!isGameStatus(row.status) || !isPatternKey(row.pattern)) return [];
      return [
        {
          id: row.id,
          deckId: row.deckId,
          status: row.status,
          pattern: row.pattern,
          joinCode: row.joinCode,
          createdAt: row.createdAt,
          wonByTeamId: row.wonByTeamId,
        },
      ];
    });
  }
```

`flatMap` et non `map` : une ligne dont le statut ne serait pas reconnu disparaît de l historique au lieu de faire échouer toute la liste. C est le bon compromis pour un écran de consultation — le chemin de jeu, lui, lève une erreur, ce que fait déjà `toState`.

Aucun `where` sur `tenantId` : l extension de cloisonnement du noyau l injecte. En écrire un à la main serait exactement l anti-pattern que CLAUDE.md paragraphe 14 proscrit.

- [ ] **Étape 5 : lancer le test d intégration**

Lancer : `pnpm --filter @quetzal/module-loto test:integration`
Attendu : `Tests 17 passed`.

- [ ] **Étape 6 : écrire le test du cas d usage qui échoue**

```ts
import { describe, it, expect } from 'vitest';
import { ListGamesUseCase } from './list-games.use-case.js';
import { FakeDeckRepository, FakeGameRepository, deckOf } from './testing/fake-repositories.js';

const SETTINGS = { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 6 } as const;

describe('ListGamesUseCase', () => {
  it('joint le nom du jeu de cartes à chaque partie', async () => {
    const decks = new FakeDeckRepository();
    const games = new FakeGameRepository();
    decks.add(deckOf(54, { id: 'deck-1', name: 'Lotería tradicional' }));
    await games.create({ deckId: 'deck-1', createdBy: 'u-1', joinCode: 'AAA222', settings: { ...SETTINGS } });

    const list = await new ListGamesUseCase(games, decks).execute();

    expect(list[0]?.deckName).toBe('Lotería tradicional');
  });

  it('affiche une partie dont le jeu a été supprimé, sans nom plutôt que sans partie', async () => {
    const decks = new FakeDeckRepository();
    const games = new FakeGameRepository();
    await games.create({ deckId: 'disparu', createdBy: 'u-1', joinCode: 'AAA222', settings: { ...SETTINGS } });

    const list = await new ListGamesUseCase(games, decks).execute();

    expect(list).toHaveLength(1);
    expect(list[0]?.deckName).toBeNull();
  });

  it('ne lit chaque jeu de cartes qu une fois, même pour dix parties', async () => {
    const decks = new FakeDeckRepository();
    const games = new FakeGameRepository();
    decks.add(deckOf(54, { id: 'deck-1' }));
    for (let i = 0; i < 10; i++) {
      await games.create({ deckId: 'deck-1', createdBy: 'u-1', joinCode: `C${String(i)}`, settings: { ...SETTINGS } });
    }
    let reads = 0;
    const original = decks.findById.bind(decks);
    decks.findById = async (id: string) => {
      reads += 1;
      return original(id);
    };

    await new ListGamesUseCase(games, decks).execute();
    expect(reads).toBe(1);
  });
});
```

Le troisième test n est pas de la performance pour la performance : l historique d une année scolaire, c est quelques centaines de parties sur une poignée de jeux, et une lecture par partie ferait des centaines d allers-retours pour rien.

`FakeGameRepository` doit gagner une méthode `list()` qui rend ses parties, la plus récente d abord — les fabriques factices implémentent le port, donc elles suivent quand il s élargit.

- [ ] **Étape 7 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/list-games.use-case.spec.ts`
Attendu : ÉCHEC, `Cannot find module './list-games.use-case.js'`.

- [ ] **Étape 8 : écrire le cas d usage**

```ts
import { Injectable } from '@nestjs/common';
import type { DeckRepository } from '../domain/ports/deck.repository.js';
import type { GameRepository, GameSummary } from '../domain/ports/game.repository.js';

export interface GameHistoryEntry extends GameSummary {
  deckName: string | null;
}

@Injectable()
export class ListGamesUseCase {
  constructor(
    private readonly games: GameRepository,
    private readonly decks: DeckRepository,
  ) {}

  async execute(): Promise<GameHistoryEntry[]> {
    const list = await this.games.list();

    const names = new Map<string, string | null>();
    for (const deckId of new Set(list.map((game) => game.deckId))) {
      const deck = await this.decks.findById(deckId);
      names.set(deckId, deck?.name ?? null);
    }

    return list.map((game) => ({ ...game, deckName: names.get(game.deckId) ?? null }));
  }
}
```

- [ ] **Étape 9 : lancer le test et brancher la route**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/application/list-games.use-case.spec.ts`
Attendu : `Tests 3 passed`.

Dans `game.controller.ts`, injecter `ListGamesUseCase` et ajouter, **avant** `@Get(':id')** pour que `games` ne soit pas pris pour un identifiant :

```ts
  @Get()
  async list() {
    return { games: await this.listGames.execute() };
  }
```

Dans `loto.module.ts` :

```ts
    {
      provide: ListGamesUseCase,
      useFactory: (games: GameRepository, decks: DeckRepository) => new ListGamesUseCase(games, decks),
      inject: [GAMES, DECKS],
    },
```

- [ ] **Étape 10 : ajouter la création de partie et l historique à l écran des jeux**

Dans `decks-page.tsx`, sous la liste des jeux :

```tsx
interface GameHistoryEntry {
  id: string;
  deckName: string | null;
  status: string;
  joinCode: string;
  createdAt: string;
}

// ...

  const [games, setGames] = useState<GameHistoryEntry[]>([]);
  const [gameDeckId, setGameDeckId] = useState('');
  const [pattern, setPattern] = useState('linea');
  const [maxTeams, setMaxTeams] = useState(6);
  const [penalty, setPenalty] = useState(0);

  const reloadGames = useCallback(async () => {
    const res = await apiClient().apiFetch('/api/modules/loto/games');
    if (!res.ok) return;
    const data = (await res.json()) as { games: GameHistoryEntry[] };
    setGames(data.games);
  }, []);

  async function createGame(): Promise<void> {
    const res = await apiClient().apiFetch('/api/modules/loto/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deckId: gameDeckId,
        pattern,
        maxTeams,
        falseClaimPenaltyDraws: penalty,
      }),
    });
    if (!res.ok) return;
    const game = (await res.json()) as { id: string };
    window.location.assign(`/modules/loto/games/${game.id}`);
  }
```

et le fragment de rendu :

```tsx
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('../game.create')}</h2>
        <div className="flex flex-wrap items-end gap-2">
          <select value={gameDeckId} onChange={(event) => setGameDeckId(event.target.value)}>
            {decks
              .filter((deck) => deck.cardCount >= MIN_PLAYABLE)
              .map((deck) => (
                <option key={deck.id} value={deck.id}>{deck.name}</option>
              ))}
          </select>
          <select value={pattern} onChange={(event) => setPattern(event.target.value)}>
            {['linea', 'esquinas', 'centro', 'llena'].map((key) => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
          <Input
            type="number"
            min={1}
            max={20}
            value={maxTeams}
            onChange={(event) => setMaxTeams(Number(event.target.value))}
          />
          <Input
            type="number"
            min={0}
            max={99}
            value={penalty}
            onChange={(event) => setPenalty(Number(event.target.value))}
          />
          <Button disabled={gameDeckId === ''} onClick={() => void createGame()} data-testid="create-game">
            {t('../game.create')}
          </Button>
        </div>
      </section>

      <ul className="space-y-1" data-testid="game-history">
        {games.map((game) => (
          <li key={game.id}>
            <a href={`/modules/loto/games/${game.id}`}>
              {game.deckName ?? '—'} · {game.joinCode} · {game.status}
            </a>
          </li>
        ))}
      </ul>
```

La liste déroulante ne propose que les jeux d au moins seize cartes : proposer un jeu injouable pour recevoir une erreur ensuite serait un mauvais service. La pénalité est à zéro par défaut, ce dont dépend la boucle de l E2E de la tâche 35.

Les clés de traduction employées ici traversent deux espaces de noms. Plutôt que la notation `'../game.create'` esquissée ci-dessus, qui n existe pas dans next-intl, prendre **deux** hooks dans le composant :

```tsx
  const t = useTranslations('module.loto.decks');
  const tGame = useTranslations('module.loto.game');
```

et employer `tGame('create')`, `tGame('pattern')`, `tGame('maxTeams')`, `tGame('penalty')`. Les libellés des quatre figures viennent de `useTranslations('module.loto.pattern')`.

- [ ] **Étape 11 : vérifier et commiter**

Lancer : `pnpm --filter @quetzal/module-loto test && pnpm --filter @quetzal/module-loto test:integration && pnpm --filter @quetzal/module-loto typecheck && pnpm --filter @quetzal/module-loto lint`
Attendu : tout vert.

```bash
git add packages/module-loto/src/infrastructure/prisma-game.repository.integration.spec.ts packages/module-loto/src/application/list-games.use-case.spec.ts
git commit -m "test(module-loto): historique des parties, cloisonné et sans N+1"
git add packages/module-loto/src/domain/ports/game.repository.ts packages/module-loto/src/infrastructure/prisma-game.repository.ts packages/module-loto/src/application/list-games.use-case.ts packages/module-loto/src/presentation/game.controller.ts packages/module-loto/src/loto.module.ts packages/module-loto/src/presentation/ui/decks-page.tsx
git commit -m "feat(module-loto): historique et création de partie

Le manifeste déclarait GET /games sans que rien ne la serve, et aucun écran
ne créait de partie alors que l E2E clique sur le bouton. Une partie dont le
jeu a été supprimé s affiche sans nom plutôt que de disparaître."
```

## Étape 6 — Images

But de l étape : les cartes portent les photos du jeu d Elda. C est ce qui fait la différence entre un exercice de vocabulaire et une lotería.

Décision D6 : les images vivent en base, derrière un port. Une carte redimensionnée pèse quelques dizaines de kilooctets, un jeu complet quelques mégaoctets, à comparer au palier gratuit de Neon. Aucun service supplémentaire, aucun secret de plus, cloisonnement par locataire hérité de l extension Prisma.

**Déclencheur de migration, à inscrire dans la dette dès maintenant** : le jour où un deuxième module a besoin d images, la capacité remonte au niveau de la plateforme et bascule sur un stockage objet servi par CDN. Le port rend ce basculement équivalent au remplacement d un adaptateur.

### Tâche 39 : Port des images, stockage et service

**Fichiers :**
- Créer : `packages/module-loto/src/domain/ports/card-image.store.ts`
- Créer : `packages/module-loto/src/infrastructure/prisma-card-image.store.ts`
- Test : `packages/module-loto/src/infrastructure/prisma-card-image.store.integration.spec.ts`
- Créer : `packages/module-loto/src/presentation/image.controller.ts`
- Modifier : `packages/module-loto/src/loto.module.ts`
- Modifier : `packages/module-loto/src/manifest.ts`

- [ ] **Étape 1 : écrire le port**

```ts
export interface StoredImage {
  id: string;
  contentHash: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface CardImageStore {
  /** Rend l image existante si le contenu est déjà stocké : l empreinte déduplique. */
  put(input: { mimeType: string; bytes: Uint8Array }): Promise<StoredImage>;
  findByHash(contentHash: string): Promise<StoredImage | null>;
}
```

- [ ] **Étape 2 : écrire le test d intégration qui échoue**

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ensureTestPostgres, resetTestDatabase, seedTenant } from '@quetzal/core/testing/index';
import { tenantStore } from '@quetzal/core';
import { PrismaCardImageStore } from './prisma-card-image.store.js';

function inTenant<T>(tenantId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStore.run({ tenantId, userId, requestId: 'test' }, () => fn().then(resolve, reject));
  });
}

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

describe('PrismaCardImageStore (intégration)', () => {
  beforeAll(async () => { await ensureTestPostgres(); });
  beforeEach(async () => { await resetTestDatabase(); });

  it('stocke une image et la relit par son empreinte', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const store = new PrismaCardImageStore();

    const stored = await inTenant(tenantId, ownerId, () => store.put({ mimeType: 'image/webp', bytes: PNG }));
    expect(stored.contentHash).toHaveLength(64);

    const found = await inTenant(tenantId, ownerId, () => store.findByHash(stored.contentHash));
    expect(found?.mimeType).toBe('image/webp');
    expect(Array.from(found?.bytes ?? [])).toEqual(Array.from(PNG));
  });

  it('déduplique : le même contenu deux fois ne crée qu une ligne', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const store = new PrismaCardImageStore();

    const first = await inTenant(tenantId, ownerId, () => store.put({ mimeType: 'image/webp', bytes: PNG }));
    const second = await inTenant(tenantId, ownerId, () => store.put({ mimeType: 'image/webp', bytes: PNG }));

    expect(second.id).toBe(first.id);
  });

  it('cloisonne les images entre locataires', async () => {
    const { tenantId, ownerId } = await seedTenant();
    const store = new PrismaCardImageStore();
    const stored = await inTenant(tenantId, ownerId, () => store.put({ mimeType: 'image/webp', bytes: PNG }));

    const other = await seedTenant();
    const leaked = await inTenant(other.tenantId, other.ownerId, () => store.findByHash(stored.contentHash));
    expect(leaked).toBeNull();
  });
});
```

- [ ] **Étape 3 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto test:integration`
Attendu : ÉCHEC, `Cannot find module './prisma-card-image.store.js'`.

- [ ] **Étape 4 : écrire l implémentation**

```ts
import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { newId } from '@quetzal/db';
import { getTenantScopedPrisma } from '@quetzal/core';
import type { CardImageStore, StoredImage } from '../domain/ports/card-image.store.js';

interface ImageRow {
  id: string;
  contentHash: string;
  mimeType: string;
  bytes: Uint8Array;
}

interface PrismaWithImages {
  loto_CardImage: {
    findFirst(args: { where: Record<string, unknown> }): Promise<ImageRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<ImageRow>;
  };
}

@Injectable()
export class PrismaCardImageStore implements CardImageStore {
  private get prisma(): PrismaWithImages {
    return getTenantScopedPrisma() as unknown as PrismaWithImages;
  }

  async put(input: { mimeType: string; bytes: Uint8Array }): Promise<StoredImage> {
    const contentHash = createHash('sha256').update(input.bytes).digest('hex');
    const existing = await this.prisma.loto_CardImage.findFirst({ where: { contentHash } });
    if (existing !== null) return existing;

    return this.prisma.loto_CardImage.create({
      data: { id: newId(), contentHash, mimeType: input.mimeType, bytes: input.bytes },
    });
  }

  async findByHash(contentHash: string): Promise<StoredImage | null> {
    return this.prisma.loto_CardImage.findFirst({ where: { contentHash } });
  }
}
```

L empreinte du contenu sert de clé, ce qui déduplique naturellement quand la même image sert deux cartes, et rend l adresse immuable — donc cachable indéfiniment.

- [ ] **Étape 5 : écrire le contrôleur d images**

```ts
import { Controller, Get, Header, NotFoundException, Param, Post, Body, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ManageDecksUseCase } from '../application/manage-decks.use-case.js';
import type { CardImageStore } from '../domain/ports/card-image.store.js';

const uploadSchema = z.object({
  mimeType: z.enum(['image/webp', 'image/jpeg', 'image/png']),
  /** Contenu encodé en base64, déjà redimensionné par le navigateur. */
  data: z.string().min(1).max(4_000_000),
});

@Controller('api/modules/loto')
export class ImageController {
  constructor(
    private readonly images: CardImageStore,
    private readonly decks: ManageDecksUseCase,
  ) {}

  @Get('images/:hash')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async read(@Param('hash') hash: string) {
    const image = await this.images.findByHash(hash);
    if (image === null) throw new NotFoundException();
    return { mimeType: image.mimeType, data: Buffer.from(image.bytes).toString('base64') };
  }

  @Post('decks/:deckId/cards/:rank/image')
  async upload(
    @Param('deckId') deckId: string,
    @Param('rank') rank: string,
    @Body() body: unknown,
  ) {
    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const stored = await this.images.put({
      mimeType: parsed.data.mimeType,
      bytes: new Uint8Array(Buffer.from(parsed.data.data, 'base64')),
    });
    await this.decks.editCard({
      deckId,
      rank: Number(rank),
      patch: { imageId: stored.contentHash },
    });
    return { imageId: stored.contentHash };
  }
}
```

`Cache-Control` immuable et d un an : l adresse dépend du contenu, donc elle ne peut pas désigner autre chose demain.

L image est référencée par son empreinte et non par son identifiant de ligne, pour que l adresse reste la même après déduplication.

- [ ] **Étape 6 : déclarer le contrôleur, le port et les permissions**

Dans `loto.module.ts`, ajouter `ImageController` aux contrôleurs et le fournisseur :

```ts
    { provide: 'LotoCardImageStore', useClass: PrismaCardImageStore },
```

et injecter `'LotoCardImageStore'` dans `ImageController`.

Dans `manifest.ts`, ajouter les deux permissions que la spec section 8.3 prévoit :

```ts
    'http:POST /api/modules/loto/decks/:id/cards/:rank/image': ['owner', 'creator'],
    'http:GET /api/modules/loto/images/:hash': ['owner', 'creator', 'learner', 'guest'],
```

La lecture est ouverte aux invités : un élève doit voir les images de sa tabla.

- [ ] **Étape 7 : lancer les tests et commiter**

Lancer : `pnpm --filter @quetzal/module-loto test:integration && pnpm --filter @quetzal/module-loto exec vitest run tests/manifest.spec.ts`
Attendu : tout vert.

```bash
git add packages/module-loto/src/infrastructure/prisma-card-image.store.integration.spec.ts
git commit -m "test(module-loto): stockage des images, déduplication et cloisonnement"
git add packages/module-loto/src/domain/ports/card-image.store.ts packages/module-loto/src/infrastructure/prisma-card-image.store.ts packages/module-loto/src/presentation/image.controller.ts packages/module-loto/src/loto.module.ts packages/module-loto/src/manifest.ts
git commit -m "feat(module-loto): images en base derrière un port

Décision D6. L empreinte du contenu sert de clé : la même image pour deux
cartes ne coûte qu une ligne, et l adresse étant dérivée du contenu, elle est
cachable indéfiniment. Le port rend le basculement vers un stockage objet
équivalent au remplacement d un adaptateur, le jour où un deuxième module en
aura besoin."
```

### Tâche 40 : Envoi et redimensionnement côté navigateur

Sans redimensionnement, une classe qui charge trente tablas met la connexion de l établissement à genoux. Le calcul se fait donc sur le téléphone de l enseignante, avant l envoi.

**Fichiers :**
- Créer : `packages/module-loto/src/presentation/ui/resize-image.ts`
- Test : `packages/module-loto/src/presentation/ui/resize-image.spec.ts`
- Modifier : `packages/module-loto/src/presentation/ui/deck-editor.tsx`

- [ ] **Étape 1 : écrire le test qui échoue**

La partie testable sans navigateur est le calcul des dimensions. Le reste est de l API DOM, couvert par la vérification manuelle.

```ts
import { describe, it, expect } from 'vitest';
import { fitWithin, MAX_IMAGE_EDGE } from './resize-image.js';

describe('fitWithin', () => {
  it('ramène le côté le plus long à la borne', () => {
    expect(fitWithin(2400, 1200)).toEqual({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE / 2 });
  });

  it('fonctionne aussi en portrait', () => {
    expect(fitWithin(600, 1800)).toEqual({ width: MAX_IMAGE_EDGE / 3, height: MAX_IMAGE_EDGE });
  });

  it('n agrandit jamais une image déjà petite', () => {
    expect(fitWithin(200, 100)).toEqual({ width: 200, height: 100 });
  });

  it('arrondit à l entier : un canvas n a pas de demi-pixel', () => {
    const { width, height } = fitWithin(1000, 333);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
  });

  it('ne rend jamais une dimension nulle', () => {
    const { width, height } = fitWithin(4000, 3);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu il échoue**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/presentation/ui/resize-image.spec.ts`
Attendu : ÉCHEC, `Cannot find module './resize-image.js'`.

- [ ] **Étape 3 : écrire l implémentation**

```ts
/** Côté le plus long après redimensionnement. Au-delà, on paie du réseau pour rien. */
export const MAX_IMAGE_EDGE = 800;

export function fitWithin(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_IMAGE_EDGE) return { width, height };
  const ratio = MAX_IMAGE_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export async function resizeToDataUrl(file: File): Promise<{ mimeType: string; data: string }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Canvas 2D indisponible');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // WebP avec repli JPEG : Safari a longtemps rendu un PNG quand on lui
  // demandait du WebP, ce qui triplait le poids sans prévenir.
  const webp = canvas.toDataURL('image/webp', 0.82);
  const dataUrl = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.82);

  const [header = '', data = ''] = dataUrl.split(',');
  const mimeType = header.slice(5, header.indexOf(';'));
  return { mimeType, data };
}
```

- [ ] **Étape 4 : brancher l envoi dans l éditeur**

Dans `deck-editor.tsx`, ajouter à chaque carte, sous le champ de nom :

```tsx
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) void upload(card.rank, file);
              }}
            />
```

et la fonction correspondante :

```tsx
  async function upload(rank: number, file: File): Promise<void> {
    const { resizeToDataUrl } = await import('./resize-image.js');
    const payload = await resizeToDataUrl(file);
    const res = await apiClient().apiFetch(`/api/modules/loto/decks/${deckId}/cards/${String(rank)}/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) await reload();
  }
```

`capture="environment"` ouvre directement l appareil photo sur un téléphone, ce qui est le geste réel : Elda photographie ses cartes une par une.

- [ ] **Étape 5 : lancer les tests et commiter**

Lancer : `pnpm --filter @quetzal/module-loto exec vitest run src/presentation/ui/resize-image.spec.ts && pnpm --filter @quetzal/module-loto typecheck`
Attendu : `Tests 5 passed`, typecheck silencieux.

```bash
git add packages/module-loto/src/presentation/ui/resize-image.spec.ts
git commit -m "test(module-loto): calcul de redimensionnement des images"
git add packages/module-loto/src/presentation/ui/resize-image.ts packages/module-loto/src/presentation/ui/deck-editor.tsx
git commit -m "feat(module-loto): envoi d images redimensionnées côté navigateur

Sans redimensionnement, une classe qui charge trente tablas met la connexion
de l établissement à genoux. Repli JPEG explicite : Safari a longtemps rendu
un PNG quand on lui demandait du WebP, ce qui triplait le poids sans prévenir."
```

### Tâche 41 : Préchargement et repli

Dernière tâche du sous-projet. Elle règle le seul moment où la classe entière tape le réseau en même temps : le premier tirage.

**Fichiers :**
- Modifier : `packages/module-loto/src/presentation/ui/guest-join.tsx`
- Modifier : `packages/module-loto/src/presentation/ui/components/card-face.tsx`

- [ ] **Étape 1 : précharger les images de la tabla pendant la salle d attente**

Dans `PlayerBoard`, ajouter :

```tsx
  useEffect(() => {
    if (snapshot?.tabla === undefined || snapshot?.tabla === null) return;
    // Les images d une tabla sont chargées pendant l attente, ce qui étale la
    // charge sur la durée des connexions au lieu de la concentrer au premier
    // tirage, quand trente téléphones demandent tout en même temps.
    for (const card of snapshot.tabla.cards) {
      if (card.imageId === null) continue;
      const image = new Image();
      image.src = `/api/modules/loto/images/${card.imageId}`;
    }
  }, [snapshot?.tabla]);
```

- [ ] **Étape 2 : rendre le repli visible quand une image manque à l appel**

Dans `card-face.tsx`, une image qui échoue au chargement doit retomber sur le nom plutôt que laisser un cadre vide :

```tsx
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = imageId !== null && !imageFailed;
```

et dans le rendu :

```tsx
      {!showImage ? (
        <span>{label}</span>
      ) : (
        <img
          src={`/api/modules/loto/images/${imageId}`}
          alt={label}
          onError={() => setImageFailed(true)}
          className="max-h-full object-contain"
        />
      )}
```

Le repli n est pas une politesse : sur un wifi d établissement, une image sur trente échoue, et une case vide sur une tabla rend la partie injouable pour cet élève.

- [ ] **Étape 3 : vérifier à la main**

- Charger une image sur trois cartes d un jeu, lancer une partie, rejoindre depuis un téléphone.
- Les cartes avec image s affichent en image, les autres en toutes lettres, dans la même grille.
- Couper le réseau du téléphone une seconde après l affichage de la tabla, le rétablir : la tabla se réaffiche à l identique, marquages compris.

- [ ] **Étape 4 : commit**

```bash
git add packages/module-loto/src/presentation/ui/guest-join.tsx packages/module-loto/src/presentation/ui/components/card-face.tsx
git commit -m "feat(module-loto): préchargement des images et repli typographique

Le préchargement pendant la salle d attente étale la charge au lieu de la
concentrer au premier tirage. Le repli sur le nom en cas d échec n est pas
une politesse : une case vide rend la tabla injouable pour cet élève."
```

**Fin de l étape 6, et du sous-projet 2.**

- [ ] Lancer : `pnpm turbo run build lint typecheck test`
      Attendu : tout vert sur tous les paquets.
- [ ] Lancer : `pnpm --filter @quetzal/module-loto test:integration`
- [ ] Lancer : `pnpm exec playwright test`
- [ ] Lancer : `pnpm audit --prod --audit-level high`
      Attendu : exit 0.
- [ ] Invoquer l agent `correcteur-labs` sur les commits du sous-projet, comme au sous-projet 1 : verdict GO, FIX ou STOP.
- [ ] Mettre à jour `docs/journal/project-log.md` et la mémoire projet.

## Dette laissée ouverte, à tracer en issues

À ouvrir avant de clore le sous-projet, pour qu aucun de ces points ne vive seulement dans ce document :

1. **Ajout d une carte à un jeu vierge** — `PATCH` ne crée pas un rang inexistant. Route `POST /decks/:id/cards` à écrire si Elda part d un jeu vierge plutôt que d une duplication.
2. **Images orphelines** — cette version ne supprime jamais une image. Supprimer un jeu laisse ses images en base. Accepté au volume visé ; le nettoyage viendra avec la remontée du stockage au niveau de la plateforme.
3. **Stockage objet** — déclencheur : un deuxième module qui a besoin d images. Le port `CardImageStore` rend le basculement équivalent au remplacement d un adaptateur.
4. **Renommage d équipe par l animatrice** — hors périmètre assumé de la spec, demandé tôt ou tard.
5. **Plusieurs figures successives dans une même partie** — hors périmètre assumé. Déclencheur : la demande d enchaîner `linea` puis `llena` sans recréer de partie.
6. **`typecheck` du reste du dépôt n inclut pas les specs** — `module-loto` a son `tsconfig.typecheck.json`, les autres paquets non. À généraliser au niveau de `packages/config`.
7. **Effectifs au-delà de trente-cinq** — non mesuré. À constater à la première séance en classe entière.
