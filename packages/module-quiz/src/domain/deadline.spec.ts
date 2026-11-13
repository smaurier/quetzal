import { describe, it, expect } from 'vitest';
import { GRACE_MS } from './scoring.js';
import { accueilDeLaReponse, instantDeFermeture } from './deadline.js';

/**
 * D8 : une question se ferme par une ECHEANCE PERSISTEE, evaluee
 * paresseusement. Il n'y a aucun minuteur serveur, aucun `setTimeout` : la
 * question est fermee parce que l'horloge a depasse `deadlineAt`, pas parce
 * qu'un processus s'est reveille.
 *
 * ⛔ C'est ce qui rend la fermeture juste apres une mise en veille de l'instance
 * Render : au reveil, l'echeance est deja dans le passe et la question est
 * fermee, sans qu'aucun reveil rate n'ait laisse une question ouverte pour
 * toujours.
 */
describe('accueilDeLaReponse, mode defi', () => {
  const fenetre = { deadlineAt: 20_000, closedAt: null };

  it('accepte une reponse arrivee bien avant l echeance', () => {
    expect(accueilDeLaReponse(fenetre, 5_000)).toEqual({ kind: 'a-temps' });
  });

  it('accepte une reponse arrivee pile a l echeance', () => {
    expect(accueilDeLaReponse(fenetre, 20_000)).toEqual({ kind: 'a-temps' });
  });

  /**
   * ⛔ Spec §8 point 1 : une selection ou une frappe DEJA ENGAGEE au moment de
   * la fermeture se valide dans une courte marge. Sans elle, la penalite
   * temporelle s'ajoute a une penalite motrice pour qui vise lentement.
   */
  it('accepte dans la grace, et le dit, pour que le bareme n accorde aucun bonus', () => {
    expect(accueilDeLaReponse(fenetre, 20_000 + GRACE_MS - 1)).toEqual({ kind: 'dans-la-grace' });
  });

  it('accepte au dernier instant de la grace', () => {
    expect(accueilDeLaReponse(fenetre, 20_000 + GRACE_MS)).toEqual({ kind: 'dans-la-grace' });
  });

  /**
   * ⛔ LA BORNE. Un `<=` de trop ici etendrait la grace d'une milliseconde, ce
   * qui est anodin ; mais un `<` manquant la rendrait INFINIE, et la question
   * ne se fermerait jamais.
   */
  it('refuse juste apres la fin de la grace', () => {
    expect(accueilDeLaReponse(fenetre, 20_000 + GRACE_MS + 1)).toEqual({
      kind: 'trop-tard',
      raison: 'echeance-depassee',
    });
  });

  it('refuse tres au-dela', () => {
    expect(accueilDeLaReponse(fenetre, 900_000)).toEqual({
      kind: 'trop-tard',
      raison: 'echeance-depassee',
    });
  });

  /**
   * ⛔ Une question FERMEE A LA MAIN par l'animatrice avant son echeance
   * refuse au-dela de la grace, meme si l'echeance n'est pas atteinte. Sinon
   * son geste « on passe a la suite » n'aurait aucun effet.
   */
  it('refuse au-dela de la grace quand l animatrice a ferme avant l echeance', () => {
    expect(accueilDeLaReponse({ deadlineAt: 20_000, closedAt: 8_000 }, 9_000)).toEqual({
      kind: 'trop-tard',
      raison: 'question-fermee',
    });
  });

  it('accorde la grace, sans bonus, juste apres une fermeture anticipee', () => {
    expect(accueilDeLaReponse({ deadlineAt: 20_000, closedAt: 8_000 }, 8_300)).toEqual({
      kind: 'dans-la-grace',
    });
  });

  /**
   * Une reponse recue avant le clic peut etre evaluee apres lui (course entre
   * la reception et l'ecriture de la fermeture) : elle etait a temps.
   */
  it('accepte a temps une reponse arrivee avant la fermeture manuelle', () => {
    expect(accueilDeLaReponse({ deadlineAt: 20_000, closedAt: 8_000 }, 7_000)).toEqual({
      kind: 'a-temps',
    });
  });

  /**
   * ⛔ D8 : le chemin NORMAL est la fermeture appelee a zero par le navigateur
   * de l'animatrice. La grace de §8 (frappe deja engagee) doit survivre a ce
   * clic, sinon elle ne s'applique jamais.
   */
  it('accorde la grace a une reponse evaluee apres la fermeture a l echeance', () => {
    expect(accueilDeLaReponse({ deadlineAt: 20_000, closedAt: 20_000 }, 20_100)).toEqual({
      kind: 'dans-la-grace',
    });
  });

  it('refuse apres la grace d une fermeture a l echeance', () => {
    expect(accueilDeLaReponse({ deadlineAt: 20_000, closedAt: 20_000 }, 20_000 + GRACE_MS + 1)).toEqual({
      kind: 'trop-tard',
      raison: 'question-fermee',
    });
  });

  /**
   * ⛔ Une fermeture tardive ne prolonge rien : la fin est la plus tot des
   * deux bornes, et la grace part de l'echeance.
   */
  it('mesure la grace depuis l echeance quand la fermeture est plus tardive', () => {
    const fenetre = { deadlineAt: 20_000, closedAt: 25_000 };
    expect(accueilDeLaReponse(fenetre, 20_300)).toEqual({ kind: 'dans-la-grace' });
    expect(accueilDeLaReponse(fenetre, 20_000 + GRACE_MS + 1)).toEqual({
      kind: 'trop-tard',
      raison: 'echeance-depassee',
    });
  });
});

describe('accueilDeLaReponse, mode controle', () => {
  /**
   * D6 : aucun minuteur, donc `deadlineAt` est null et rien n'expire. La seule
   * fin possible est le geste de l'animatrice.
   */
  it('accepte toujours quand il n y a aucune echeance', () => {
    expect(accueilDeLaReponse({ deadlineAt: null, closedAt: null }, 9_000_000)).toEqual({
      kind: 'a-temps',
    });
  });

  /**
   * §8 parle de « la fermeture », pas de l'echeance : la grace motrice vaut
   * aussi apres le clic en mode controle. Le bareme du controle ne donnant
   * qu'un point fixe, elle n'y cree aucun bonus.
   */
  it('accorde la grace juste apres la fermeture manuelle, meme sans echeance', () => {
    expect(accueilDeLaReponse({ deadlineAt: null, closedAt: 1_000 }, 1_200)).toEqual({
      kind: 'dans-la-grace',
    });
  });

  it('refuse apres la grace de la fermeture manuelle', () => {
    expect(accueilDeLaReponse({ deadlineAt: null, closedAt: 1_000 }, 1_000 + GRACE_MS + 1)).toEqual({
      kind: 'trop-tard',
      raison: 'question-fermee',
    });
  });
});

describe('instantDeFermeture', () => {
  it('ferme a maintenant quand rien n expire (mode controle)', () => {
    expect(instantDeFermeture(null, 7_000)).toBe(7_000);
  });

  it('ferme a maintenant quand l echeance n est pas encore la', () => {
    expect(instantDeFermeture(20_000, 7_000)).toBe(7_000);
  });

  it('ferme a l echeance, pas a maintenant, quand elle est depassee', () => {
    expect(instantDeFermeture(20_000, 90_000)).toBe(20_000);
  });
});
