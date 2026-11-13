import { describe, it, expect } from 'vitest';
import { GRACE_MS } from './scoring.js';
import { accueilDeLaReponse } from './deadline.js';

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
   * ⛔ Une question FERMEE A LA MAIN par l'animatrice refuse, meme si son
   * echeance n'est pas atteinte. Sinon son geste « on passe a la suite »
   * n'aurait aucun effet, et des reponses continueraient d'arriver sur une
   * question que la classe a quittee.
   */
  it('refuse quand l animatrice a ferme la question avant son echeance', () => {
    expect(accueilDeLaReponse({ deadlineAt: 20_000, closedAt: 8_000 }, 9_000)).toEqual({
      kind: 'trop-tard',
      raison: 'question-fermee',
    });
  });

  it('refuse meme une reponse anterieure a la fermeture manuelle', () => {
    // L'horodatage d'arrivee est mesure a la reception, donc une reponse
    // « anterieure » signale une horloge qui recule ou un rejeu. On refuse.
    expect(accueilDeLaReponse({ deadlineAt: 20_000, closedAt: 8_000 }, 7_000)).toEqual({
      kind: 'trop-tard',
      raison: 'question-fermee',
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

  it('refuse apres la fermeture manuelle, meme sans echeance', () => {
    expect(accueilDeLaReponse({ deadlineAt: null, closedAt: 1_000 }, 1_200)).toEqual({
      kind: 'trop-tard',
      raison: 'question-fermee',
    });
  });

  /**
   * ⛔ La grace ne doit PAS s'appliquer en mode controle : il n'y a rien dont
   * elle serait la marge. L'accorder ferait croire a un bonus absent, et
   * surtout rendrait `dans-la-grace` la ou le bareme attend `a-temps`.
   */
  it('ne rend jamais dans-la-grace quand il n y a aucune echeance', () => {
    const accueil = accueilDeLaReponse({ deadlineAt: null, closedAt: null }, 50_000);
    expect(accueil.kind).not.toBe('dans-la-grace');
  });
});
