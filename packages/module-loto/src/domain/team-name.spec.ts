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
