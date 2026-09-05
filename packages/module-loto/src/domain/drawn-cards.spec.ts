import { describe, it, expect } from 'vitest';
import { drawnCardIds } from './drawn-cards.js';

describe('drawnCardIds', () => {
  it('construit un ensemble vide à partir d une liste vide', () => {
    expect(drawnCardIds([]).size).toBe(0);
  });

  it('déduplique les identifiants répétés', () => {
    expect(drawnCardIds(['a', 'b', 'a']).size).toBe(2);
  });

  it('répond vrai à has pour un identifiant présent', () => {
    const ids = drawnCardIds(['a', 'b']);
    const [first] = ids;
    expect(ids.has(first!)).toBe(true);
  });

  it('répond faux à has pour un identifiant absent', () => {
    const ids = drawnCardIds(['a', 'b']);
    const [otherId] = drawnCardIds(['z']);
    expect(ids.has(otherId!)).toBe(false);
  });
});
