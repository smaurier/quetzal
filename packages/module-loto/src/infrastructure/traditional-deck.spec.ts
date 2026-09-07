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
