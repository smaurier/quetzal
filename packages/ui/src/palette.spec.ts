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
