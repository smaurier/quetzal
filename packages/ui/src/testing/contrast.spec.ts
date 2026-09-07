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
