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

/**
 * Issue #29 : l'animatrice ne pouvait pas renommer une équipe.
 *
 * L'issue notait que le nom n'était **pas** stocké, par choix, et que le
 * renommage obligeait à décider où il vit alors. Le commentaire de `TeamState`
 * donnait les deux raisons du choix d'origine : le passage de un à deux membres
 * deviendrait une transition à gérer, et un libellé traduit finirait en base.
 *
 * La décision prise ici répond aux deux. Un nom CHOISI est une troisième
 * variante de l'union, pas un remplacement du dérivé :
 *
 * - il ne bouge pas avec la composition de l'équipe, donc aucune transition à
 *   gérer — le dérivé reste le repli quand rien n'est choisi ;
 * - il n'est pas une clé de traduction mais un texte tapé par un humain, et
 *   `kind: 'custom'` le dit à l'écran, qui doit l'afficher tel quel.
 */
describe('teamNameFor, un nom choisi', () => {
  it('prend le pas sur le nom derive du membre unique', () => {
    expect(
      teamNameFor({ memberDisplayNames: ['Ana'], teamIndex: 0, chosenName: 'Los jaguares' }),
    ).toEqual({ kind: 'custom', label: 'Los jaguares' });
  });

  it('prend le pas sur le numero', () => {
    expect(
      teamNameFor({ memberDisplayNames: ['Ana', 'Beto'], teamIndex: 3, chosenName: 'Los jaguares' }),
    ).toEqual({ kind: 'custom', label: 'Los jaguares' });
  });

  it('replie sur le derive quand rien n est choisi', () => {
    expect(teamNameFor({ memberDisplayNames: ['Ana'], teamIndex: 0, chosenName: null })).toEqual({
      kind: 'member',
      displayName: 'Ana',
    });
  });

  /**
   * Une chaine vide ou blanche n est pas un nom. Le cas arrive : l animatrice
   * efface le champ pour revenir au nom derive, et c est la facon dont on
   * ANNULE un renommage — il n y a donc pas de second geste a prevoir.
   */
  it('traite un nom blanc comme une absence de nom', () => {
    expect(teamNameFor({ memberDisplayNames: ['Ana'], teamIndex: 0, chosenName: '   ' })).toEqual({
      kind: 'member',
      displayName: 'Ana',
    });
  });

  it('coupe les blancs autour d un nom choisi', () => {
    expect(
      teamNameFor({ memberDisplayNames: [], teamIndex: 0, chosenName: '  Los jaguares  ' }),
    ).toEqual({ kind: 'custom', label: 'Los jaguares' });
  });

  it('ne rend toujours aucun libelle traduit', () => {
    const name = teamNameFor({ memberDisplayNames: [], teamIndex: 0, chosenName: 'Los jaguares' });
    expect(JSON.stringify(name)).not.toContain('Equipo');
    expect(JSON.stringify(name)).not.toContain('Équipe');
  });
});
