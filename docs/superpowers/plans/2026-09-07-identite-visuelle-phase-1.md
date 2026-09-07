# Identité visuelle Quetzal, phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à Quetzal sa palette propre, rendre le mode sombre atteignable et vérifié, et empêcher par construction qu'une retouche future le casse en silence.

**Architecture:** Les jetons vivent dans `packages/ui/src/globals.css` et sont la seule source de couleur. La préférence de mode est un cookie lu côté serveur dans la mise en page racine, qui pose une classe sur `<html>` avant la première peinture — le même partage que la langue. Toute la logique testable est extraite dans `apps/host/src/lib/`, comme `locale-handler.ts` : la couche Presentation reste couverte par Playwright (CLAUDE.md §5, exemption 2).

**Tech Stack:** Tailwind 3.4 (`darkMode: ['class']`), Next 15 App Router, vitest 3.2, Playwright, ESLint flat config.

**Spec :** `docs/superpowers/specs/2026-09-07-identite-visuelle-quetzal-design.md`

---

## Décisions prises en écrivant ce plan

Trois points que la spec laissait ouverts et qu'il valait mieux trancher ici que pendant l'exécution.

**1. Les deux règles de garde sont des règles ESLint, pas des tests.** La spec demandait des tests parcourant les sources pour interdire les utilitaires `dark:` et les couleurs en dur. Un test qui scanne d'autres paquets depuis `packages/ui` serait une inversion de dépendance bizarre, et il signalerait un fichier sans pointer la ligne. ESLint fait exactement ce travail, `pnpm turbo run lint` couvre déjà tous les paquets, et le message s'affiche à la bonne ligne dans l'éditeur. Les deux voiles `bg-black/80` reçoivent un `eslint-disable-next-line` commenté, ce qui documente l'exception au lieu de la cacher dans une liste blanche.

**2. `theme-color` est un export statique, pas `generateViewport`.** Lire le cookie dans `generateViewport` obligerait à envelopper le `<html>` dans un `<Suspense>` ou à poser `export const instant = false` sur la mise en page racine — donc à faire rendre **toutes** les routes à chaque requête. C'est un prix disproportionné pour la couleur d'une barre d'adresse. L'export statique à deux entrées suit la préférence système : exact dans le cas par défaut, légèrement décalé pour qui choisit l'inverse de son système. Ce décalage est acceptable ; la régression de performance ne le serait pas.

**3. La colonne `User.theme` est la dernière tâche, et elle est facultative.** Le cookie livre la fonctionnalité complète pour tout le monde, invités compris. La colonne n'ajoute que la synchronisation entre appareils pour les titulaires de compte — et ce n'est pas évidemment souhaitable : beaucoup de gens veulent leur téléphone en sombre et leur portable en clair. La langue a besoin d'une colonne parce que le serveur doit connaître la langue d'un utilisateur hors de sa requête ; le thème n'a aucun besoin équivalent. **Recommandation : s'arrêter après la tâche 11.** La tâche 12 est écrite si Sylvain veut quand même la synchronisation.

---

## Structure des fichiers

**Créés :**

| Fichier | Responsabilité |
|---|---|
| `packages/ui/vitest.config.ts` | Faire tourner les tests du paquet ui |
| `packages/ui/src/testing/contrast.ts` | HSL → luminance → rapport de contraste. Pur. |
| `packages/ui/src/testing/contrast.spec.ts` | Prouve le calcul sur des valeurs connues |
| `packages/ui/src/testing/css-tokens.ts` | Extrait les jetons d'un bloc de `globals.css`. Pur. |
| `packages/ui/src/testing/css-tokens.spec.ts` | Prouve l'extraction |
| `packages/ui/src/palette.spec.ts` | Les paires du § 6 de la spec, dans les deux modes |
| `packages/ui/src/theme-blocks.spec.ts` | Parité `.dark` / bloc média, et garde `.light` |
| `apps/host/src/lib/theme.ts` | Préférence → classe, `color-scheme`. Pur. |
| `apps/host/src/lib/theme.spec.ts` | |
| `apps/host/src/lib/theme-handler.ts` | Fabrique du gestionnaire PATCH |
| `apps/host/src/lib/theme-handler.spec.ts` | |
| `apps/host/src/app/api/user/theme/route.ts` | Câblage |
| `apps/host/src/components/shell/theme-switcher.tsx` | Le sélecteur |
| `e2e/tests/theme.e2e.spec.ts` | Rendu initial, absence de clignotement, page invité |

**Modifiés :**

| Fichier | Changement |
|---|---|
| `packages/ui/package.json` | script `test` + devDep `vitest` |
| `packages/ui/src/globals.css` | palette Quetzal, bloc média du mode système |
| `packages/ui/src/components/toast.tsx:80` | rouges en dur → jetons |
| `packages/ui/src/components/dialog.tsx:25` | `eslint-disable` commenté sur le voile |
| `packages/ui/src/components/sheet.tsx:25` | idem |
| `packages/config/eslint/flat.js` | deux règles `no-restricted-syntax` |
| `apps/host/src/app/layout.tsx` | classe + `color-scheme` + `themeColor` |
| `apps/host/src/app/dashboard/layout.tsx` | lit le cookie, le passe à la barre |
| `apps/host/src/components/shell/topbar.tsx` | monte le sélecteur |
| `apps/host/src/components/shell/locale-switcher.tsx` | étiquette traduite |
| `packages/i18n/catalogues/{fr,en,es}.json` | clés `common.theme.*` et `common.locale.label` |

---

### Task 1: Faire tourner des tests dans `packages/ui`

`packages/ui` est le seul paquet du monorepo, hors `@quetzal/config`, sans infrastructure de test. Le test de contraste n'a nulle part où atterrir. La CI n'a pas besoin d'être touchée : elle lance `pnpm turbo run test`, qui ramassera le nouveau script.

Câblage pur (CLAUDE.md §5, exemption 1) : pas de commit `test:` préalable.

**Files:**
- Create: `packages/ui/vitest.config.ts`
- Modify: `packages/ui/package.json`

- [ ] **Step 1: Créer la configuration, calquée sur `packages/core/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
```

- [ ] **Step 2: Ajouter le script et la dépendance**

Dans `packages/ui/package.json`, ajouter `"test": "vitest run"` aux `scripts` (après `"lint"`), et `"vitest": "^3.2.7"` aux `devDependencies`.

- [ ] **Step 3: Installer**

Run: `pnpm install`
Expected: installation sans erreur.

- [ ] **Step 4: Vérifier que le runner démarre**

Run: `pnpm --filter @quetzal/ui test`
Expected: échec `No test files found`. C'est le résultat correct — il prouve que vitest tourne et cherche au bon endroit. Ne pas ajouter `passWithNoTests` : la tâche 2 apporte le premier fichier.

- [ ] **Step 5: Ne pas committer encore**

Cette tâche laisse `pnpm turbo run test` en échec tant qu'aucun fichier de test n'existe. Le commit part avec le test rouge de la tâche 2, à son étape 3 — un commit `test:` est censé être rouge, un commit de configuration seul serait simplement cassé.

---

### Task 2: Le calcul de contraste

Logique pure : TDD strict, deux commits.

**Files:**
- Create: `packages/ui/src/testing/contrast.ts`
- Test: `packages/ui/src/testing/contrast.spec.ts`

- [ ] **Step 1: Écrire le test rouge**

```ts
import { describe, it, expect } from 'vitest';
import { contrastRatio, parseHsl } from './contrast.js';

describe('parseHsl', () => {
  it('lit la forme utilisée par shadcn, sans virgules ni fonction', () => {
    expect(parseHsl('165 62% 26%')).toEqual({ h: 165, s: 62, l: 26 });
  });

  it('accepte les décimales, que la palette shadcn par défaut utilise', () => {
    expect(parseHsl('222.2 84% 4.9%')).toEqual({ h: 222.2, s: 84, l: 4.9 });
  });

  it('refuse une valeur illisible plutôt que de rendre un NaN silencieux', () => {
    expect(() => parseHsl('rgb(0,0,0)')).toThrow(/illisible/);
  });
});

describe('contrastRatio', () => {
  // Les deux bornes de l'échelle WCAG : elles ancrent le calcul sur des
  // valeurs qu'on peut vérifier de tête, sans recalculer la formule.
  it('rend 21 entre le noir et le blanc', () => {
    expect(contrastRatio('0 0% 0%', '0 0% 100%')).toBeCloseTo(21, 5);
  });

  it('rend 1 entre une couleur et elle-même', () => {
    expect(contrastRatio('165 62% 26%', '165 62% 26%')).toBeCloseTo(1, 5);
  });

  it("est symétrique : l'ordre des arguments ne change rien", () => {
    const a = contrastRatio('0 0% 20%', '0 0% 90%');
    const b = contrastRatio('0 0% 90%', '0 0% 20%');
    expect(a).toBeCloseTo(b, 10);
  });

  // Valeur de référence tierce : le gris #767676 sur blanc est l'exemple
  // canonique du seuil 4,5:1 dans la documentation WCAG.
  it('place #767676 sur blanc juste au-dessus de 4,5:1', () => {
    const ratio = contrastRatio('0 0% 46.3%', '0 0% 100%');
    expect(ratio).toBeGreaterThan(4.5);
    expect(ratio).toBeLessThan(4.6);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `pnpm --filter @quetzal/ui test`
Expected: FAIL — `Failed to resolve import "./contrast.js"`.

- [ ] **Step 3: Commit du test rouge**

```bash
git add packages/ui/vitest.config.ts packages/ui/package.json pnpm-lock.yaml packages/ui/src/testing/contrast.spec.ts
git commit -m "test(ui): ancrer le calcul de contraste sur les bornes WCAG"
```

Le câblage de la tâche 1 part dans ce commit : c'est ce qui évite de laisser un commit intermédiaire où `turbo run test` échoue sans qu'aucun test ne l'explique.

- [ ] **Step 4: Écrire l'implémentation**

```ts
export interface Hsl {
  readonly h: number;
  readonly s: number;
  readonly l: number;
}

// Les jetons shadcn sont stockés sans `hsl()` ni virgules — « 165 62% 26% » —
// parce que Tailwind les compose en `hsl(var(--x) / <alpha>)`. On lit donc
// cette forme-là, et rien d'autre.
const HSL = /^(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/;

export function parseHsl(value: string): Hsl {
  const match = HSL.exec(value.trim());
  if (match === null) throw new Error(`Valeur HSL illisible : « ${value} »`);
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

function hslToRgb({ h, s, l }: Hsl): readonly [number, number, number] {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hue = (((h % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((hue % 2) - 1));
  const offset = lightness - chroma / 2;
  const sectors: readonly (readonly [number, number, number])[] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ];
  const sector = sectors[Math.floor(hue) % 6] ?? sectors[0]!;
  return [sector[0] + offset, sector[1] + offset, sector[2] + offset];
}

function relativeLuminance(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hslToRgb(parseHsl(a)));
  const lb = relativeLuminance(hslToRgb(parseHsl(b)));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
```

- [ ] **Step 5: Lancer le test, vérifier qu'il passe**

Run: `pnpm --filter @quetzal/ui test`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/testing/contrast.ts
git commit -m "feat(ui): calculer le rapport de contraste WCAG depuis un jeton HSL"
```

---

### Task 3: Lire les jetons d'un bloc CSS

**Files:**
- Create: `packages/ui/src/testing/css-tokens.ts`
- Test: `packages/ui/src/testing/css-tokens.spec.ts`

- [ ] **Step 1: Écrire le test rouge**

```ts
import { describe, it, expect } from 'vitest';
import { readTokenBlock } from './css-tokens.js';

// Le bloc média est placé AVANT `:root` À DESSEIN. `:root` est un préfixe
// littéral de `:root:not(.light):not(.dark)` : dans cet ordre, un indexOf naïf
// tombe sur le sélecteur du bloc média et rend les jetons sombres. Avec
// l'ordre naturel du vrai fichier, le bug ne se manifesterait pas et le test
// passerait sans rien prouver.
const CSS = `
@layer base {
  @media (prefers-color-scheme: dark) {
    :root:not(.light):not(.dark) {
      --background: 165 24% 7%;
    }
  }
  :root {
    --background: 40 30% 99%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 165 24% 7%;
  }
}
`;

describe('readTokenBlock', () => {
  it('rend les jetons du sélecteur demandé', () => {
    expect(readTokenBlock(CSS, ':root')).toEqual({
      background: '40 30% 99%',
      radius: '0.5rem',
    });
  });

  it('ne confond pas :root avec le sélecteur du bloc média qui le préfixe', () => {
    // Sans la garde, on obtiendrait ici les jetons sombres — et le test de
    // parité de la tâche 5 se comparerait alors à lui-même : il passerait
    // toujours, en ne prouvant rien.
    expect(readTokenBlock(CSS, ':root')['background']).toBe('40 30% 99%');
    expect(readTokenBlock(CSS, ':root')).not.toHaveProperty('background', '165 24% 7%');
  });

  it('rend le bloc imbriqué dans une requête média', () => {
    expect(readTokenBlock(CSS, ':root:not(.light):not(.dark)')).toEqual({
      background: '165 24% 7%',
    });
  });

  it('échoue fort quand le sélecteur est absent, plutôt que de rendre un objet vide', () => {
    expect(() => readTokenBlock(CSS, '.introuvable')).toThrow(/introuvable/);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `pnpm --filter @quetzal/ui test css-tokens`
Expected: FAIL — `Failed to resolve import "./css-tokens.js"`.

- [ ] **Step 3: Commit du test rouge**

```bash
git add packages/ui/src/testing/css-tokens.spec.ts
git commit -m "test(ui): lire les jetons d'un bloc CSS, y compris sous une requête média"
```

- [ ] **Step 4: Écrire l'implémentation**

```ts
// Lecteur volontairement minimal : il sert à vérifier notre propre fichier de
// jetons, pas à analyser du CSS quelconque. Ajouter postcss ici serait une
// dépendance pour un besoin de test.
export function readTokenBlock(css: string, selector: string): Record<string, string> {
  const start = findSelector(css, selector);
  const open = css.indexOf('{', start);
  if (open === -1) throw new Error(`Bloc sans accolade pour « ${selector} »`);

  let depth = 0;
  let close = -1;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) throw new Error(`Bloc non refermé pour « ${selector} »`);

  const tokens: Record<string, string> = {};
  for (const [, name, value] of css.slice(open + 1, close).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[name!] = value!.trim();
  }
  return tokens;
}

// `:root` est un préfixe littéral de `:root:not(.light):not(.dark)`. Un
// indexOf simple rendrait le mauvais bloc et le test de parité se comparerait
// alors à lui-même : il passerait toujours, en ne prouvant rien.
function findSelector(css: string, selector: string): number {
  let from = 0;
  for (;;) {
    const at = css.indexOf(selector, from);
    if (at === -1) throw new Error(`Sélecteur introuvable : « ${selector} »`);
    const after = css.slice(at + selector.length).trimStart()[0];
    if (after === '{' || after === ',') return at;
    from = at + selector.length;
  }
}
```

- [ ] **Step 5: Lancer le test, vérifier qu'il passe**

Run: `pnpm --filter @quetzal/ui test css-tokens`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/testing/css-tokens.ts
git commit -m "feat(ui): extraire les jetons d'un bloc de globals.css"
```

---

### Task 4: La palette, tenue par son test

Le test rouge de cette tâche échoue sur la palette shadcn actuelle. C'est voulu : c'est lui qui décrit la palette avant qu'elle existe.

**Files:**
- Create: `packages/ui/src/palette.spec.ts`
- Modify: `packages/ui/src/globals.css`

- [ ] **Step 1: Écrire le test rouge**

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { contrastRatio } from './testing/contrast.js';
import { readTokenBlock } from './testing/css-tokens.js';

const CSS = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8');

const LIGHT = readTokenBlock(CSS, ':root');
const DARK = readTokenBlock(CSS, '.dark');

// Le tableau du § 6 de la spec, ligne pour ligne. `border` n'y est pas : c'est
// un filet décoratif, aucun seuil ne s'y applique. `input` y est deux fois,
// parce qu'un champ repose tantôt sur le fond de page, tantôt sur une carte.
const PAIRS: readonly (readonly [string, string, number])[] = [
  ['foreground', 'background', 4.5],
  ['foreground', 'card', 4.5],
  ['muted-foreground', 'background', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['destructive-foreground', 'destructive', 4.5],
  ['brand-crimson-foreground', 'brand-crimson', 4.5],
  ['brand-gold-foreground', 'brand-gold', 4.5],
  ['input', 'background', 3],
  ['input', 'card', 3],
  ['ring', 'background', 3],
];

describe.each([
  ['clair', LIGHT],
  ['sombre', DARK],
])('palette, mode %s', (_mode, tokens) => {
  it.each(PAIRS)('%s sur %s atteint %s:1', (front, back, threshold) => {
    const a = tokens[front];
    const b = tokens[back];
    expect(a, `jeton --${front} absent`).toBeDefined();
    expect(b, `jeton --${back} absent`).toBeDefined();
    expect(contrastRatio(a as string, b as string)).toBeGreaterThanOrEqual(threshold);
  });

  it('déclare les deux signaux de marque', () => {
    expect(tokens['brand-crimson']).toBeDefined();
    expect(tokens['brand-gold']).toBeDefined();
  });

  it('dissocie --border de --input : ils ne portent pas la même exigence', () => {
    expect(tokens['border']).not.toBe(tokens['input']);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `pnpm --filter @quetzal/ui test palette`
Expected: FAIL. Plusieurs échecs, tous instructifs : `jeton --brand-crimson-foreground absent` (la palette shadcn ne les a pas), et l'échec de `input` sur `background`, puisque shadcn donne la même valeur claire à `border` et `input`.

- [ ] **Step 3: Commit du test rouge**

```bash
git add packages/ui/src/palette.spec.ts
git commit -m "test(ui): exiger les paires de contraste du § 6 de la spec"
```

- [ ] **Step 4: Écrire la palette**

Remplacer intégralement les blocs `:root` et `.dark` de `packages/ui/src/globals.css` par ceci. Ne pas toucher aux trois directives `@tailwind` en tête ni à l'ouverture de `@layer base`.

```css
  :root {
    --background: 40 30% 99%;
    --foreground: 165 20% 12%;
    --card: 0 0% 100%;
    --card-foreground: 165 20% 12%;
    --popover: 0 0% 100%;
    --popover-foreground: 165 20% 12%;
    --primary: 165 62% 26%;
    --primary-foreground: 40 30% 99%;
    --secondary: 45 22% 94%;
    --secondary-foreground: 165 22% 18%;
    --muted: 45 20% 95%;
    --muted-foreground: 165 8% 40%;
    --accent: 45 26% 92%;
    --accent-foreground: 165 22% 18%;
    --destructive: 8 72% 48%;
    --destructive-foreground: 40 30% 99%;
    --border: 42 16% 88%;
    --input: 42 14% 53%;
    --ring: 165 62% 26%;
    --radius: 0.5rem;

    /* Signaux de marque — jamais des surfaces. Mettre le cramoisi dans
       --secondary ou l'or dans --accent rendrait tous les boutons secondaires
       rouges et tous les survols dorés : dans shadcn ces deux jetons-là sont
       des surfaces, pas des accents. */
    --brand-crimson: 355 62% 44%;
    --brand-crimson-foreground: 40 30% 99%;
    --brand-gold: 38 82% 48%;
    --brand-gold-foreground: 165 30% 10%;
  }

  .dark {
    --background: 165 24% 7%;
    --foreground: 40 22% 95%;
    --card: 165 20% 11%;
    --card-foreground: 40 22% 95%;
    --popover: 165 20% 11%;
    --popover-foreground: 40 22% 95%;
    --primary: 158 52% 56%;
    --primary-foreground: 165 30% 9%;
    --secondary: 165 16% 18%;
    --secondary-foreground: 40 22% 95%;
    --muted: 165 16% 16%;
    --muted-foreground: 155 10% 62%;
    --accent: 165 18% 20%;
    --accent-foreground: 40 22% 95%;
    --destructive: 8 62% 58%;
    --destructive-foreground: 165 30% 9%;
    --border: 165 14% 20%;
    --input: 165 12% 39%;
    --ring: 158 52% 56%;

    --brand-crimson: 355 60% 62%;
    --brand-crimson-foreground: 165 30% 9%;
    --brand-gold: 40 78% 58%;
    --brand-gold-foreground: 165 30% 9%;
  }
```

- [ ] **Step 5: Lancer le test, vérifier qu'il passe**

Run: `pnpm --filter @quetzal/ui test palette`
Expected: PASS — 24 tests (10 paires + 2 assertions structurelles, × 2 modes).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/globals.css
git commit -m "feat(ui): poser la palette Quetzal en lieu et place des gris shadcn"
```

---

### Task 5: Le mode système, qui sans ce bloc ne rendrait jamais sombre

`darkMode: ['class']` fait que rien, dans le CSS généré, ne réagit à `prefers-color-scheme`. Le bloc doit être écrit à la main. Il duplique la palette sombre — le CSS ne sait pas l'éviter — et c'est le test qui tient la duplication.

**Files:**
- Create: `packages/ui/src/theme-blocks.spec.ts`
- Modify: `packages/ui/src/globals.css`

- [ ] **Step 1: Écrire le test rouge**

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { readTokenBlock } from './testing/css-tokens.js';

const CSS = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8');
const SYSTEM_SELECTOR = ':root:not(.light):not(.dark)';

describe('bloc du mode système', () => {
  it("existe : sans lui, darkMode class ne réagit à rien et le mode système reste clair", () => {
    expect(CSS).toContain('@media (prefers-color-scheme: dark)');
  });

  it('exclut .light, sans quoi le système écraserait un choix explicite', () => {
    expect(CSS).toContain(SYSTEM_SELECTOR);
  });

  it('déclare exactement les mêmes jetons que .dark, aux mêmes valeurs', () => {
    // La duplication est inévitable en CSS. C'est cette assertion qui
    // l'empêche de dériver — et elle dériverait en silence, sur le seul mode
    // que personne ne pense à ouvrir : celui de l'utilisateur qui n'a rien
    // réglé, donc de la majorité.
    expect(readTokenBlock(CSS, SYSTEM_SELECTOR)).toEqual(readTokenBlock(CSS, '.dark'));
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `pnpm --filter @quetzal/ui test theme-blocks`
Expected: FAIL — les trois tests échouent, le troisième sur `Sélecteur introuvable : « :root:not(.light):not(.dark) »`.

- [ ] **Step 3: Commit du test rouge**

```bash
git add packages/ui/src/theme-blocks.spec.ts
git commit -m "test(ui): exiger le bloc du mode système et sa parité avec .dark"
```

- [ ] **Step 4: Ajouter le bloc**

Dans `packages/ui/src/globals.css`, juste après le bloc `.dark` et toujours à l'intérieur de `@layer base`, ajouter le bloc suivant. **Copier les valeurs du bloc `.dark` à l'identique** — le test de l'étape 1 refuse tout écart.

```css
  /* Sans ce bloc, le mode « système » ne rendrait jamais sombre : la
     configuration Tailwind du dépôt est darkMode: ['class'], donc rien dans le
     CSS généré ne réagit à prefers-color-scheme. Le :not(.light) est ce qui
     empêche le système d'écraser un choix explicite de l'utilisateur. */
  @media (prefers-color-scheme: dark) {
    :root:not(.light):not(.dark) {
      --background: 165 24% 7%;
      --foreground: 40 22% 95%;
      --card: 165 20% 11%;
      --card-foreground: 40 22% 95%;
      --popover: 165 20% 11%;
      --popover-foreground: 40 22% 95%;
      --primary: 158 52% 56%;
      --primary-foreground: 165 30% 9%;
      --secondary: 165 16% 18%;
      --secondary-foreground: 40 22% 95%;
      --muted: 165 16% 16%;
      --muted-foreground: 155 10% 62%;
      --accent: 165 18% 20%;
      --accent-foreground: 40 22% 95%;
      --destructive: 8 62% 58%;
      --destructive-foreground: 165 30% 9%;
      --border: 165 14% 20%;
      --input: 165 12% 39%;
      --ring: 158 52% 56%;

      --brand-crimson: 355 60% 62%;
      --brand-crimson-foreground: 165 30% 9%;
      --brand-gold: 40 78% 58%;
      --brand-gold-foreground: 165 30% 9%;
    }
  }
```

- [ ] **Step 5: Lancer les tests, vérifier qu'ils passent**

Run: `pnpm --filter @quetzal/ui test`
Expected: PASS. **Reporter le nombre réel affiché, jamais le nombre attendu.**

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/globals.css
git commit -m "feat(ui): rendre le mode système effectivement sombre"
```

---

### Task 6: La préférence de mode, logique pure

Extraite dans `lib/` pour être testable en environnement node, comme `locale-handler.ts` : `apps/host` n'a ni jsdom ni testing-library, et la couche Presentation y est couverte par Playwright (CLAUDE.md §5, exemption 2).

**Files:**
- Create: `apps/host/src/lib/theme.ts`
- Test: `apps/host/src/lib/theme.spec.ts`

- [ ] **Step 1: Écrire le test rouge**

```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_THEME,
  THEME_COOKIE,
  colorScheme,
  isThemePreference,
  readThemePreference,
  themeClassName,
} from './theme';

describe('readThemePreference', () => {
  it('rend la préférence écrite dans le cookie', () => {
    expect(readThemePreference('dark')).toBe('dark');
    expect(readThemePreference('light')).toBe('light');
  });

  it('retombe sur « système » quand le cookie est absent', () => {
    expect(readThemePreference(undefined)).toBe('system');
    expect(DEFAULT_THEME).toBe('system');
  });

  it('retombe sur « système » sur une valeur inventée, plutôt que de la propager', () => {
    expect(readThemePreference('sombre')).toBe('system');
    expect(readThemePreference('')).toBe('system');
  });
});

describe('themeClassName', () => {
  it('pose .dark et .light pour les choix explicites', () => {
    expect(themeClassName('dark')).toBe('dark');
    expect(themeClassName('light')).toBe('light');
  });

  it("ne pose aucune classe en mode système : c'est la requête média qui décide", () => {
    // Trois valeurs, pas deux. La classe `light` n'est pas décorative : sans
    // elle, @media (prefers-color-scheme: dark) reprendrait la main sur un
    // utilisateur ayant explicitement choisi le mode clair.
    expect(themeClassName('system')).toBe('');
  });
});

describe('colorScheme', () => {
  it('suit le choix explicite, pour que les contrôles natifs suivent aussi', () => {
    expect(colorScheme('dark')).toBe('dark');
    expect(colorScheme('light')).toBe('light');
  });

  it('laisse les deux ouverts en mode système', () => {
    expect(colorScheme('system')).toBe('light dark');
  });
});

describe('isThemePreference', () => {
  it("accepte les trois états et rien d'autre", () => {
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('auto')).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });
});

describe('THEME_COOKIE', () => {
  it('a un nom stable, lu par la mise en page et écrit par la route', () => {
    expect(THEME_COOKIE).toBe('quetzal-theme');
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `pnpm --filter @quetzal/host test theme`
Expected: FAIL — `Failed to resolve import "./theme"`.

- [ ] **Step 3: Commit du test rouge**

```bash
git add apps/host/src/lib/theme.spec.ts
git commit -m "test(host): décrire les trois états de la préférence de mode"
```

- [ ] **Step 4: Écrire l'implémentation**

```ts
export const THEME_COOKIE = 'quetzal-theme';
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export const DEFAULT_THEME: ThemePreference = 'system';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isThemePreference(value: string | undefined): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function readThemePreference(cookieValue: string | undefined): ThemePreference {
  return isThemePreference(cookieValue) ? cookieValue : DEFAULT_THEME;
}

// Trois valeurs et non deux. En mode système on ne pose aucune classe et on
// laisse @media (prefers-color-scheme: dark) décider ; la classe `light` sert
// à lui retirer la main quand l'utilisateur a explicitement choisi le clair.
export function themeClassName(preference: ThemePreference): string {
  return preference === 'system' ? '' : preference;
}

// Sans color-scheme, les ascenseurs, cases à cocher et menus déroulants natifs
// restent clairs sur un fond sombre.
export function colorScheme(preference: ThemePreference): string {
  return preference === 'system' ? 'light dark' : preference;
}
```

- [ ] **Step 5: Lancer le test, vérifier qu'il passe**

Run: `pnpm --filter @quetzal/host test theme`
Expected: PASS — 11 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/host/src/lib/theme.ts
git commit -m "feat(host): résoudre une préférence de mode en classe et color-scheme"
```

---

### Task 7: Le gestionnaire PATCH, qui doit servir les invités

Calqué sur `locale-handler.ts`, avec **une** différence décisive : celui de la langue rend 401 sans session. Le thème ne le peut pas — la page d'entrée invité `/j/…` n'a pas de session, et un élève arrivé par QR a autant besoin du mode sombre qu'un professeur.

**Files:**
- Create: `apps/host/src/lib/theme-handler.ts`
- Test: `apps/host/src/lib/theme-handler.spec.ts`

- [ ] **Step 1: Écrire le test rouge**

```ts
import { describe, it, expect, vi } from 'vitest';
import { createThemePatchHandler } from './theme-handler';
import { THEME_COOKIE } from './theme';

function request(body: unknown): Request {
  return new Request('http://localhost/api/user/theme', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('createThemePatchHandler', () => {
  it('pose le cookie et rend ok pour un utilisateur connecté', async () => {
    const updateTheme = vi.fn().mockResolvedValue(undefined);
    const handler = createThemePatchHandler({
      getSession: async () => ({ user: { id: 'u-1' } }),
      updateTheme,
    });

    const response = await handler(request({ theme: 'dark' }));

    expect(response.status).toBe(200);
    expect(response.cookies.get(THEME_COOKIE)?.value).toBe('dark');
    expect(updateTheme).toHaveBeenCalledWith('u-1', 'dark');
  });

  it("sert un invité sans session : le cookie est posé, la base n'est pas touchée", async () => {
    // C'est LE cas qui distingue ce gestionnaire de celui de la langue. La
    // page /j/[moduleSlug]/[sessionId] n'a pas de session ; un 401 ici
    // priverait de mode sombre tous les élèves arrivés par QR.
    const updateTheme = vi.fn();
    const handler = createThemePatchHandler({
      getSession: async () => null,
      updateTheme,
    });

    const response = await handler(request({ theme: 'dark' }));

    expect(response.status).toBe(200);
    expect(response.cookies.get(THEME_COOKIE)?.value).toBe('dark');
    expect(updateTheme).not.toHaveBeenCalled();
  });

  it('refuse une valeur hors des trois états', async () => {
    const handler = createThemePatchHandler({
      getSession: async () => ({ user: { id: 'u-1' } }),
      updateTheme: async () => undefined,
    });

    const response = await handler(request({ theme: 'sombre' }));

    expect(response.status).toBe(400);
  });

  it("pose quand même le cookie si l'écriture en base échoue", async () => {
    // Le cookie est ce qui fait rendre la page. Perdre la synchronisation
    // entre appareils est un désagrément ; rendre la page dans le mauvais mode
    // parce que la base a hoqueté serait une régression visible.
    const handler = createThemePatchHandler({
      getSession: async () => ({ user: { id: 'u-1' } }),
      updateTheme: async () => {
        throw new Error('base indisponible');
      },
    });

    const response = await handler(request({ theme: 'light' }));

    expect(response.status).toBe(200);
    expect(response.cookies.get(THEME_COOKIE)?.value).toBe('light');
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `pnpm --filter @quetzal/host test theme-handler`
Expected: FAIL — `Failed to resolve import "./theme-handler"`.

- [ ] **Step 3: Commit du test rouge**

```bash
git add apps/host/src/lib/theme-handler.spec.ts
git commit -m "test(host): exiger que la préférence de mode serve aussi les invités"
```

- [ ] **Step 4: Écrire l'implémentation**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  THEME_PREFERENCES,
  type ThemePreference,
} from './theme';

const schema = z.object({ theme: z.enum(THEME_PREFERENCES) });

export interface ThemeHandlerDeps {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  updateTheme(userId: string, theme: ThemePreference): Promise<void>;
}

// PATCH /api/user/theme : persiste la préférence de mode dans le cookie, et en
// base quand il y a un compte. Contrairement à /api/user/locale, l'absence de
// session n'est PAS une erreur : la page d'entrée invité n'en a pas.
export function createThemePatchHandler(deps: ThemeHandlerDeps) {
  return async (request: Request): Promise<NextResponse> => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const session = await deps.getSession(request.headers);
    if (session !== null) {
      // Le cookie fait rendre la page ; la base ne fait que la retrouver
      // ailleurs. Un échec de la seconde ne doit pas coûter la première.
      await deps.updateTheme(session.user.id, parsed.data.theme).catch(() => undefined);
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(THEME_COOKIE, parsed.data.theme, {
      path: '/',
      maxAge: THEME_COOKIE_MAX_AGE,
      sameSite: 'lax',
    });
    return response;
  };
}
```

- [ ] **Step 5: Lancer le test, vérifier qu'il passe**

Run: `pnpm --filter @quetzal/host test theme-handler`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/host/src/lib/theme-handler.ts
git commit -m "feat(host): persister la préférence de mode, session ou non"
```

---

### Task 8: Câbler la route et la mise en page

Câblage et Presentation (CLAUDE.md §5, exemptions 1 et 2) : couvert par les E2E de la tâche 11, pas de commit `test:` préalable.

Tant que la tâche 12 n'est pas faite, `updateTheme` n'a pas de colonne où écrire : le gestionnaire reçoit donc une fonction inerte. Le cookie suffit à la fonctionnalité.

**Files:**
- Create: `apps/host/src/app/api/user/theme/route.ts`
- Modify: `apps/host/src/app/layout.tsx`

- [ ] **Step 1: Créer la route**

```ts
import { auth } from '@quetzal/auth';
import { createThemePatchHandler } from '@/lib/theme-handler';

export const PATCH = createThemePatchHandler({
  getSession: (headers) => auth.api.getSession({ headers }),
  // Pas de colonne User.theme : la préférence vit dans le cookie, qui couvre
  // aussi les invités. Voir la tâche 12 du plan si la synchronisation entre
  // appareils devient un besoin.
  updateTheme: async () => undefined,
});
```

- [ ] **Step 2: Modifier la mise en page racine**

`apps/host/src/app/layout.tsx` attend déjà `getLocale()` et porte déjà `suppressHydrationWarning`. La classe est donc posée dans la première réponse, avant toute peinture — c'est ce qui supprime le clignotement au lieu de le panser.

```tsx
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { THEME_COOKIE, colorScheme, readThemePreference, themeClassName } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quetzal',
  description: 'Plateforme éducative interactive',
};

// Statique, et donc adossé à la préférence système plutôt qu'à la nôtre. Lire
// le cookie ici imposerait un <Suspense> autour du <html> ou `instant = false`
// sur cette mise en page — donc un rendu de TOUTES les routes à chaque
// requête. Prix disproportionné pour la couleur d'une barre d'adresse.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'hsl(40 30% 99%)' },
    { media: '(prefers-color-scheme: dark)', color: 'hsl(165 24% 7%)' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const theme = readThemePreference((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang={locale}
      className={themeClassName(theme)}
      style={{ colorScheme: colorScheme(theme) }}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Vérifier que tout compile**

Run: `pnpm turbo run typecheck lint`
Expected: PASS sur tous les paquets.

- [ ] **Step 4: Commit**

```bash
git add apps/host/src/app/api/user/theme/route.ts apps/host/src/app/layout.tsx
git commit -m "feat(host): appliquer la préférence de mode dès la première réponse"
```

---

### Task 9: Le sélecteur, et ses libellés

Presentation : couvert par les E2E de la tâche 11.

Le sélecteur de langue voisin porte `aria-label="Language"` en dur, non traduit. On ne reproduit pas ce défaut ici, et on le corrige au passage puisqu'on est dans le fichier d'à côté.

**Files:**
- Create: `apps/host/src/components/shell/theme-switcher.tsx`
- Modify: `apps/host/src/components/shell/topbar.tsx`
- Modify: `apps/host/src/components/shell/locale-switcher.tsx`
- Modify: `apps/host/src/app/dashboard/layout.tsx`
- Modify: `packages/i18n/catalogues/fr.json`, `en.json`, `es.json`

- [ ] **Step 1: Ajouter les clés dans les trois catalogues**

Dans `packages/i18n/catalogues/fr.json`, sous `common`, à côté de `locale` :

```json
    "theme": {
      "label": "Thème",
      "light": "Clair",
      "dark": "Sombre",
      "system": "Système"
    }
```

Dans `en.json` : `"label": "Theme"`, `"light": "Light"`, `"dark": "Dark"`, `"system": "System"`.
Dans `es.json` : `"label": "Tema"`, `"light": "Claro"`, `"dark": "Oscuro"`, `"system": "Sistema"`.

Ajouter aussi, dans les trois, une clé `"label"` sous `common.locale` : `"Langue"` / `"Language"` / `"Idioma"`.

- [ ] **Step 2: Régénérer les catalogues fusionnés**

Run: `pnpm --filter @quetzal/i18n merge`
Expected: `merged.{fr,en,es}.json` réécrits, sans erreur.

- [ ] **Step 3: Écrire le sélecteur**

```tsx
'use client';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { THEME_PREFERENCES, type ThemePreference } from '@/lib/theme';

export function ThemeSwitcher({ current }: { current: ThemePreference }) {
  const router = useRouter();
  const t = useTranslations('common.theme');

  async function change(theme: string) {
    await fetch('/api/user/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    });
    // La classe est posée par le serveur : c'est le rafraîchissement qui
    // applique le nouveau mode, pas une manipulation du DOM côté client.
    router.refresh();
  }

  return (
    <select
      defaultValue={current}
      onChange={(e) => change(e.target.value)}
      className="rounded-md border bg-background px-2 py-1 text-sm"
      aria-label={t('label')}
    >
      {THEME_PREFERENCES.map((preference) => (
        <option key={preference} value={preference}>
          {t(preference)}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 4: Traduire l'étiquette du sélecteur de langue**

Dans `apps/host/src/components/shell/locale-switcher.tsx`, remplacer `aria-label="Language"` par `aria-label={t('label')}`. Le `t` du composant pointe déjà sur `common.locale`.

- [ ] **Step 5: Monter le sélecteur dans la barre**

`topbar.tsx` est un composant client, il ne peut pas lire le cookie. La préférence descend depuis la mise en page, qui la connaît déjà.

Dans `apps/host/src/components/shell/topbar.tsx`, ajouter les imports :

```tsx
import { ThemeSwitcher } from './theme-switcher';
import type { ThemePreference } from '@/lib/theme';
```

Changer la signature en `export function Topbar({ theme }: { theme: ThemePreference })` et insérer `<ThemeSwitcher current={theme} />` juste avant `<LocaleSwitcher />`.

- [ ] **Step 6: Passer la préférence depuis la mise en page du tableau de bord**

Dans `apps/host/src/app/dashboard/layout.tsx`, ajouter :

```tsx
import { cookies } from 'next/headers';
import { THEME_COOKIE, readThemePreference } from '@/lib/theme';
```

puis, dans le corps du composant, `const theme = readThemePreference((await cookies()).get(THEME_COOKIE)?.value);` et `<Topbar theme={theme} />`. Si le composant n'est pas déjà `async`, le rendre `async`.

- [ ] **Step 7: Vérifier**

Run: `pnpm turbo run typecheck lint test`
Expected: PASS partout.

- [ ] **Step 8: Commit**

```bash
git add apps/host/src/components/shell packages/i18n/catalogues apps/host/src/app/dashboard/layout.tsx
git commit -m "feat(host): offrir le choix du mode dans la barre, en trois langues"
```

---

### Task 10: Interdire par lint ce que la palette ne peut pas rattraper

Deux pièges, deux règles. Un utilitaire `dark:` compile en `.dark &` : il ne s'appliquerait donc pas en mode système, et serait cassé précisément chez l'utilisateur qui n'a rien réglé. Une couleur Tailwind en dur échappe au test de contraste — c'est le cas du bouton de fermeture d'un toast destructif, dont l'anneau de focus n'est aujourd'hui surveillé par rien.

**Files:**
- Modify: `packages/ui/src/components/toast.tsx:80`
- Modify: `packages/ui/src/components/dialog.tsx:25`, `packages/ui/src/components/sheet.tsx:25`
- Modify: `packages/config/eslint/flat.js`

- [ ] **Step 1: Corriger le toast d'abord, pour que la règle arrive sur un dépôt propre**

Dans `packages/ui/src/components/toast.tsx` ligne 80, remplacer les quatre classes rouges en dur par des jetons :

- `group-[.destructive]:text-red-300` → `group-[.destructive]:text-destructive-foreground/70`
- `group-[.destructive]:hover:text-red-50` → `group-[.destructive]:hover:text-destructive-foreground`
- `group-[.destructive]:focus:ring-red-400` → `group-[.destructive]:focus:ring-destructive-foreground`
- `group-[.destructive]:focus:ring-offset-red-600` → `group-[.destructive]:focus:ring-offset-destructive`

- [ ] **Step 2: Documenter les deux exceptions légitimes**

Au-dessus de la ligne 25 de `dialog.tsx` **et** de `sheet.tsx` :

```tsx
      // Un voile est noir par nature, dans les deux modes : ce n'est pas une
      // surface de l'interface mais un assombrissement de ce qu'il y a dessous.
      // eslint-disable-next-line no-restricted-syntax
```

- [ ] **Step 3: Ajouter les deux règles**

Dans `packages/config/eslint/flat.js`, dans le bloc de règles qui porte déjà `react/jsx-no-literals`, ajouter :

```js
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/(?:^|\\s)dark:/]',
          message:
            "Pas d'utilitaire `dark:` : la configuration est darkMode: ['class'], il ne s'appliquerait donc pas en mode système — cassé chez l'utilisateur qui n'a rien réglé. Utiliser les jetons, qui basculent seuls.",
        },
        {
          selector:
            'Literal[value=/(?:^|\\s)(?:bg|text|border|ring|ring-offset|fill|stroke|from|via|to|decoration|outline|shadow|accent|caret|divide|placeholder)-(?:white|black|slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\\d{2,3})?(?:\\/\\d{1,3})?(?:$|\\s)/]',
          message:
            'Couleur Tailwind en dur : elle échappe au test de contraste de packages/ui. Utiliser un jeton (bg-background, text-foreground, border-input…).',
        },
      ],
```

- [ ] **Step 3 bis: Ne pas toucher au QR**

Aucune ligne de code à écrire, mais une tentation à écarter explicitement. `packages/module-loto/src/presentation/ui/animator-page.tsx` génère le QR via `toDataURL(joinUrl, { margin: 4, width: 512 })`, donc avec les couleurs par défaut de la bibliothèque : modules noirs sur fond blanc **opaque**.

Sur une carte sombre, ce carré blanc va paraître détonner. Il doit rester tel quel : un lecteur de QR a besoin du contraste des modules et de la zone de silence, et le « mettre aux couleurs du thème » casse le flashage depuis le fond d'une classe. Les règles de lint de cette tâche ne peuvent pas l'attraper — c'est un objet d'options JavaScript, pas une classe CSS.

- [ ] **Step 4: Lancer le lint et vérifier qu'il ne signale plus rien**

Run: `pnpm turbo run lint`
Expected: PASS. Si une occurrence non prévue sort, la corriger avec un jeton — pas avec un `eslint-disable` muet.

- [ ] **Step 5: Prouver que la règle mord**

Ajouter temporairement `<div className="bg-red-500 dark:bg-blue-500" />` dans `apps/host/src/components/shell/topbar.tsx`, puis :

Run: `pnpm --filter @quetzal/host lint`
Expected: FAIL, **deux** erreurs sur cette ligne, une par règle. Une règle qu'on n'a pas vue échouer ne prouve rien. Retirer ensuite la ligne et relancer : PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/config/eslint/flat.js packages/ui/src/components
git commit -m "feat(config): interdire les utilitaires dark: et les couleurs en dur"
```

---

### Task 11: Les E2E, qui prouvent l'absence de clignotement

C'est le seul test capable de dire que la classe est présente **dans la première réponse**, et non posée après coup par un script.

**Files:**
- Create: `e2e/tests/theme.e2e.spec.ts`

- [ ] **Step 1: Écrire les tests**

```ts
import { test, expect, type BrowserContext } from '@playwright/test';

const THEME_COOKIE = 'quetzal-theme';

async function setTheme(context: BrowserContext, value: string) {
  const url = process.env['E2E_HOST_URL'] ?? 'http://localhost:3000';
  await context.addCookies([{ name: THEME_COOKIE, value, url }]);
}

test('la classe dark est dans la première réponse, pas ajoutée après coup', async ({
  page,
  context,
}) => {
  await setTheme(context, 'dark');
  // On lit le HTML servi, pas le DOM après hydratation : c'est la différence
  // entre « pas de clignotement » et « clignotement qu'on n'a pas vu ».
  const response = await page.goto('/login');
  expect(await response!.text()).toMatch(/<html[^>]*class="[^"]*dark/);
});

test('le mode clair explicite pose .light, qui retire la main au système', async ({
  page,
  context,
}) => {
  await setTheme(context, 'light');
  const response = await page.goto('/login');
  expect(await response!.text()).toMatch(/<html[^>]*class="[^"]*light/);
});

test('le mode système ne pose aucune classe', async ({ page, context }) => {
  await setTheme(context, 'system');
  const response = await page.goto('/login');
  expect(await response!.text()).not.toMatch(/<html[^>]*class="[^"]*(?:dark|light)/);
});

test('le fond suit réellement le mode, jeton compris', async ({ page, context }) => {
  await setTheme(context, 'dark');
  await page.goto('/login');
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // hsl(165 24% 7%) une fois résolu par le navigateur.
  expect(background).toBe('rgb(14, 22, 20)');
});

test("la page invité respecte la préférence, alors qu'elle n'a pas de session", async ({
  page,
  context,
}) => {
  // Le cas que la colonne en base ne couvrirait pas : un élève arrivé par QR.
  await setTheme(context, 'dark');
  const response = await page.goto('/j/loto/inexistante?tenantId=inexistant');
  expect(await response!.text()).toMatch(/<html[^>]*class="[^"]*dark/);
});

test('la couleur du navigateur mobile est déclarée pour les deux modes', async ({ page }) => {
  // Une seule valeur remplacerait un décalage par un autre : la barre
  // d'adresse resterait claire sous une page sombre, ou l'inverse.
  const response = await page.goto('/login');
  const html = await response!.text();
  expect(html).toMatch(
    /<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="[^"]+"/,
  );
  expect(html).toMatch(
    /<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="[^"]+"/,
  );
});
```

- [ ] **Step 2: Lancer les E2E**

⛔ **Ne jamais lancer `pnpm dev` pour les E2E** : il lit `.env.local`, qui pointe sur la base Neon de **production**. Suivre la procédure du dépôt — Postgres local jetable, `DATABASE_URL` explicite dans l'environnement de la commande.

Run: `pnpm exec playwright test e2e/tests/theme.e2e.spec.ts`
Expected: `6 passed`.

Si `rgb(14, 22, 20)` ne correspond pas exactement, lire la valeur réellement rendue et corriger l'attente — la conversion HSL→RGB du navigateur arrondit, et c'est elle qui fait foi, pas un calcul fait à côté.

- [ ] **Step 2 bis: Vérifier la non-régression des E2E existants**

La spec affirme qu'aucune structure ne bouge. C'est vérifiable, et ça doit l'être avant la PR : la palette change sous des tests qui n'ont pas été relus.

Run: `pnpm exec playwright test`
Expected: tous les fichiers passent, `hello.smoke`, `loto-guest` et `loto-teacher` compris, **sans qu'aucun ait été modifié**. Si l'un d'eux demande une retouche, ce n'est pas la retouche qu'il faut faire : c'est le signe qu'une mise en page a bougé, et il faut comprendre laquelle avant d'aller plus loin.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/theme.e2e.spec.ts
git commit -m "test(e2e): prouver que le mode est appliqué dès la première réponse"
```

- [ ] **Step 4: Vérifier l'ensemble avant la PR**

Run: `pnpm turbo run lint typecheck test`
Expected: PASS partout. **Reporter le nombre réel de tests affiché, jamais le nombre attendu.**

- [ ] **Step 5: Ouvrir la PR**

```bash
git push -u origin design/identite-quetzal
gh pr create --title "feat: identité visuelle Quetzal, phase 1" --body "<résumé des tâches 1 à 11>"
```

---

### Task 12 (facultative) : synchroniser le mode entre appareils

**À ne faire que si Sylvain la demande.** Voir « Décisions » en tête de plan : le cookie livre déjà la fonctionnalité pour tout le monde, et un thème qui suit l'utilisateur d'un appareil à l'autre n'est pas évidemment souhaitable.

**Files:**
- Modify: `packages/auth/prisma/auth.prisma`
- Modify: `apps/host/src/app/api/user/theme/route.ts`
- Create: une migration Prisma

- [ ] **Step 1: Ajouter la colonne au fragment source**

Dans `packages/auth/prisma/auth.prisma`, modèle `User`, après `locale String?` :

```prisma
  theme         String?
```

`packages/db/prisma/schema.prisma` est **généré** par `schema:merge` : ne pas l'éditer à la main.

- [ ] **Step 2: Créer la migration contre un Postgres LOCAL**

⛔ **Jamais contre Neon.** `.env.local` pointe sur la base de production ; `prisma migrate dev` y détruirait des données réelles. Passer une `DATABASE_URL` locale explicite dans l'environnement de la commande, et relire cette variable avant d'appuyer.

Run: `pnpm --filter @quetzal/db prisma:migrate:dev --name add_user_theme`
Expected: un dossier de migration créé, contenant un seul `ALTER TABLE "user" ADD COLUMN "theme" TEXT;`. Lire le SQL généré avant de continuer.

- [ ] **Step 3: Brancher l'écriture**

Dans `apps/host/src/app/api/user/theme/route.ts`, remplacer la fonction inerte :

```ts
import { rootPrisma } from '@quetzal/db';

  updateTheme: async (userId, theme) => {
    await rootPrisma.user.update({ where: { id: userId }, data: { theme } });
  },
```

- [ ] **Step 4: Vérifier**

Run: `pnpm turbo run typecheck test`
Expected: PASS. Les tests de `theme-handler` couvrent déjà ce chemin, y compris l'échec d'écriture.

- [ ] **Step 5: Commit**

```bash
git add packages/auth/prisma/auth.prisma packages/db/prisma/migrations apps/host/src/app/api/user/theme/route.ts
git commit -m "feat(host): retrouver son mode depuis un autre appareil"
```

La CI applique la migration en production via `pnpm --filter @quetzal/db prisma:migrate:deploy`, déjà présent dans le workflow. Aucune commande manuelle contre Neon.
