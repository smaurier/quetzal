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
