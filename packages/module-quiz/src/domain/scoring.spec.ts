import { describe, it, expect } from 'vitest';
import { BASE, BONUS_MAX, GRACE_MS, pointsPour } from './scoring.js';

/**
 * Spec § 5.3 et D7. Les trois proprietes de D7 sont des TESTS et non des
 * commentaires, parce qu'elles sont exactement ce qu'une formule mal reglee
 * casse en silence : un bareme ou la vitesse prime finit par recompenser le
 * hasard rapide plutot que la connaissance.
 */
describe('pointsPour, mode controle', () => {
  const controle = { mode: 'controle' as const, openedAt: 0, deadlineAt: null };

  it('donne un point pour une reponse juste', () => {
    expect(pointsPour(controle, { isCorrect: true, arriveeMs: 500 })).toBe(1);
  });

  it('donne zero pour une reponse fausse', () => {
    expect(pointsPour(controle, { isCorrect: false, arriveeMs: 500 })).toBe(0);
  });

  /**
   * ⛔ D6 : le mode controle n'a aucun minuteur. Le temps est tout de meme
   * enregistre pour le retour de seance, mais il ne doit peser sur AUCUN score.
   */
  it('ignore completement le temps, meme enorme', () => {
    expect(pointsPour(controle, { isCorrect: true, arriveeMs: 9_000_000 })).toBe(1);
  });

  /**
   * Une seance mal figee pourrait porter une echeance en mode controle. Le
   * score ne doit pas pour autant compter le temps, c'est le mode qui decide.
   */
  it('ignore le temps meme si une echeance est presente', () => {
    const figeeParErreur = { mode: 'controle' as const, openedAt: 0, deadlineAt: 20_000 };
    expect(pointsPour(figeeParErreur, { isCorrect: true, arriveeMs: 0 })).toBe(1);
  });
});

describe('pointsPour, mode defi', () => {
  // Vingt secondes, le cas courant.
  const defi = { mode: 'defi' as const, openedAt: 0, deadlineAt: 20_000 };

  it('donne zero pour une reponse fausse, quelle que soit la vitesse', () => {
    expect(pointsPour(defi, { isCorrect: false, arriveeMs: 1 })).toBe(0);
  });

  it('donne BASE plus le bonus plein a une reponse instantanee', () => {
    expect(pointsPour(defi, { isCorrect: true, arriveeMs: 0 })).toBe(BASE + BONUS_MAX);
  });

  it('donne BASE sans bonus a une reponse arrivee pile a l echeance', () => {
    expect(pointsPour(defi, { isCorrect: true, arriveeMs: 20_000 })).toBe(BASE);
  });

  it('donne BASE plus la moitie du bonus a mi-parcours', () => {
    expect(pointsPour(defi, { isCorrect: true, arriveeMs: 10_000 })).toBe(
      BASE + Math.round(BONUS_MAX / 2));
  });

  /**
   * ⛔ PROPRIETE 1 de D7 : juste bat TOUJOURS faux. Si le bonus pouvait
   * depasser BASE, un eleve rapide et faux battrait un eleve lent et juste, et
   * le bareme recompenserait le reflexe plutot que la connaissance.
   */
  it('propriete 1 : la reponse juste la plus LENTE bat la fausse la plus RAPIDE', () => {
    const justeLente = pointsPour(defi, { isCorrect: true, arriveeMs: 20_000 });
    const fausseRapide = pointsPour(defi, { isCorrect: false, arriveeMs: 0 });
    expect(justeLente).toBeGreaterThan(fausseRapide);
  });

  /**
   * ⛔ PROPRIETE 2 de D7 : le bonus est PLAFONNE. Sans plafond, un delai long
   * rendrait l'ecart de vitesse dominant, et deux eleves egaux en connaissance
   * seraient separes par leur reseau.
   */
  it('propriete 2 : le bonus ne depasse jamais BONUS_MAX, meme sur un delai long', () => {
    const longue = { mode: 'defi' as const, openedAt: 0, deadlineAt: 120_000 };
    expect(pointsPour(longue, { isCorrect: true, arriveeMs: 0 })).toBe(BASE + BONUS_MAX);
    expect(BONUS_MAX).toBeLessThan(BASE);
  });

  /**
   * ⛔ PROPRIETE 3 de D7, et spec § 8 point 1 : la GRACE ne rapporte AUCUN
   * bonus. Sinon la marge accordee pour une raison d'accessibilite deviendrait
   * un avantage, et le plancher se retournerait contre son objet.
   */
  it('propriete 3 : une reponse dans la grace vaut BASE, sans bonus', () => {
    expect(pointsPour(defi, { isCorrect: true, arriveeMs: 20_000 + GRACE_MS - 1 })).toBe(BASE);
  });

  it('ne rend jamais de points negatifs, meme tres au-dela de l echeance', () => {
    expect(pointsPour(defi, { isCorrect: true, arriveeMs: 999_999 })).toBe(BASE);
  });

  it('plafonne le bonus a BONUS_MAX pour une arrivee avant l ouverture, decalage d horloge', () => {
    expect(pointsPour(defi, { isCorrect: true, arriveeMs: -5_000 })).toBe(BASE + BONUS_MAX);
  });

  it('arrondit le bonus a l entier le plus proche : 237,5 donne 238', () => {
    expect(pointsPour(defi, { isCorrect: true, arriveeMs: 1_000 })).toBe(BASE + 238);
  });

  /**
   * Un delai nul ou une echeance egale a l'ouverture ferait une division par
   * zero. Le reste vaut alors zero, donc BASE sans bonus : refuser serait pire,
   * une question figee ainsi deviendrait injouable en pleine seance.
   */
  it('ne divise pas par zero quand l echeance egale l ouverture', () => {
    const degenere = { mode: 'defi' as const, openedAt: 5_000, deadlineAt: 5_000 };
    expect(pointsPour(degenere, { isCorrect: true, arriveeMs: 5_000 })).toBe(BASE);
  });
});

describe('les constantes', () => {
  it('BONUS_MAX vaut exactement le quart de BASE, comme la spec l impose', () => {
    expect(BONUS_MAX).toBe(BASE / 4);
  });

  it('GRACE_MS reste petite devant le delai le plus court autorise, trois secondes', () => {
    expect(GRACE_MS).toBeLessThan(3_000 / 4);
  });

  /**
   * La grace doit DEPASSER la latence de diffusion mesuree a soixante
   * telephones (215 ms, issue #32), sinon un eleve paie le reseau et non son
   * hesitation. C'est la cartouche du dissident sur D5, partiellement couverte.
   */
  it('GRACE_MS depasse la latence de diffusion mesuree a soixante telephones', () => {
    expect(GRACE_MS).toBeGreaterThan(215);
  });
});
