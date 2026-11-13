import { describe, it, expect } from 'vitest';
import { SESSION_STATUSES, isSessionStatus, peutPasserA, peutRejoindre } from './session-status.js';

/**
 * Spec § 5.4 : `brouillon -> ouverte -> en-cours -> terminee`.
 */
describe('isSessionStatus', () => {
  it('reconnait les quatre etats de la spec, et rien d autre', () => {
    expect([...SESSION_STATUSES]).toEqual(['brouillon', 'ouverte', 'en-cours', 'terminee']);
    expect(isSessionStatus('en-cours')).toBe(true);
    expect(isSessionStatus('pause')).toBe(false);
  });
});

describe('peutPasserA', () => {
  it('autorise la marche normale, etape par etape', () => {
    expect(peutPasserA('brouillon', 'ouverte')).toBe(true);
    expect(peutPasserA('ouverte', 'en-cours')).toBe(true);
    expect(peutPasserA('en-cours', 'terminee')).toBe(true);
  });

  /**
   * ⛔ Terminer depuis `ouverte` est AUTORISE, et ce n'est pas un oubli : une
   * animatrice qui ouvre une seance et change d'avis doit pouvoir la fermer
   * sans jouer une question. Interdire cette transition laisserait des seances
   * ouvertes pour toujours, qu'aucun geste ne pourrait clore.
   */
  it('autorise de terminer une seance ouverte mais jamais commencee', () => {
    expect(peutPasserA('ouverte', 'terminee')).toBe(true);
  });

  /**
   * ⛔ Et depuis `brouillon` aussi : c'est l'equivalent d'une suppression
   * douce, et le meme raisonnement s'applique.
   */
  it('autorise de terminer un brouillon', () => {
    expect(peutPasserA('brouillon', 'terminee')).toBe(true);
  });

  it('interdit de sauter l ouverture', () => {
    expect(peutPasserA('brouillon', 'en-cours')).toBe(false);
  });

  /**
   * ⛔ Un etat TERMINEE est definitif. Le rouvrir ferait repartir une seance
   * dont le retour a peut-etre deja ete lu, et dont les scores sont figes.
   */
  it('interdit toute sortie de terminee', () => {
    for (const cible of SESSION_STATUSES) {
      expect(peutPasserA('terminee', cible)).toBe(false);
    }
  });

  it('interdit de revenir en arriere', () => {
    expect(peutPasserA('en-cours', 'ouverte')).toBe(false);
    expect(peutPasserA('ouverte', 'brouillon')).toBe(false);
  });

  it('interdit de rester au meme etat, pour qu une commande repetee se voie', () => {
    for (const etat of SESSION_STATUSES) {
      expect(peutPasserA(etat, etat)).toBe(false);
    }
  });
});

describe('peutRejoindre', () => {
  /**
   * Spec § 5.4 : on rejoint quand la session est `ouverte`, comme on entre en
   * classe avant le cours (D5 du loto).
   */
  it('laisse entrer sur une seance ouverte', () => {
    expect(peutRejoindre('ouverte')).toBe(true);
  });

  /**
   * ⛔ LA REGLE QUI COMPTE, et elle est dans la spec : « une reconnexion
   * aboutit toujours, meme session commencee : sinon une coupure wifi exclut
   * un eleve. » Le scenario de reference est un wifi d'etablissement peu
   * fiable, donc refuser ici viderait la classe au premier incident.
   */
  it('laisse entrer sur une seance DEJA commencee, sinon une coupure wifi exclut', () => {
    expect(peutRejoindre('en-cours')).toBe(true);
  });

  it('refuse sur un brouillon, qui n a pas encore de code d entree utile', () => {
    expect(peutRejoindre('brouillon')).toBe(false);
  });

  it('refuse sur une seance terminee', () => {
    expect(peutRejoindre('terminee')).toBe(false);
  });
});
