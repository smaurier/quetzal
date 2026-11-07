import { describe, it, expect, vi } from 'vitest';
import { teamLabel } from './team-label';

/** Une traduction de test qui rend sa clé et ses valeurs, pour voir ce qu on lui demande. */
const traduire = (key: string, values?: Record<string, string | number>): string =>
  `${key}(${JSON.stringify(values ?? {})})`;

describe('teamLabel', () => {
  it('rend le nom du membre unique', () => {
    expect(teamLabel({ kind: 'member', displayName: 'Ana' }, traduire)).toBe('Ana');
  });

  it('traduit le numero, parce que « Equipe 3 » depend de la langue', () => {
    expect(teamLabel({ kind: 'numbered', number: 3 }, traduire)).toBe('team.numbered({"number":3})');
  });

  /**
   * Issue #29, et la raison d etre de la variante `custom`. Un nom tape par
   * l animatrice n est pas une cle : le passer a `t()` chercherait une cle
   * inexistante et afficherait la chaine brute ou une erreur selon le moteur.
   */
  it('n appelle PAS la traduction sur un nom choisi', () => {
    const t = vi.fn(traduire);

    expect(teamLabel({ kind: 'custom', label: 'Los jaguares' }, t)).toBe('Los jaguares');

    expect(t, 'un nom tape n est pas une cle de traduction').not.toHaveBeenCalled();
  });

  it('rend un nom choisi tel quel, meme s il ressemble a une cle', () => {
    expect(teamLabel({ kind: 'custom', label: 'team.numbered' }, traduire)).toBe('team.numbered');
  });
});
