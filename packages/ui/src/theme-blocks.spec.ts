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
