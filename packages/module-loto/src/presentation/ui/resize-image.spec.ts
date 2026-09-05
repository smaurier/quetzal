import { describe, it, expect } from 'vitest';
import { fitWithin, MAX_IMAGE_EDGE } from './resize-image.js';

describe('fitWithin', () => {
  it('ramène le côté le plus long à la borne', () => {
    expect(fitWithin(2400, 1200)).toEqual({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE / 2 });
  });

  it('fonctionne aussi en portrait', () => {
    // 600 * (800 / 1800) = 266.666… : la largeur exacte n est pas un entier,
    // donc l attendu passe par le même arrondi que l implémentation plutôt
    // que par la fraction brute, qui ne peut jamais matcher un canvas.
    expect(fitWithin(600, 1800)).toEqual({ width: Math.round(MAX_IMAGE_EDGE / 3), height: MAX_IMAGE_EDGE });
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
