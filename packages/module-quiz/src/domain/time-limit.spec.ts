import { describe, it, expect } from 'vitest';
import { TIME_LIMIT_MAX, TIME_LIMIT_MIN, resoudreLeDelai } from './time-limit.js';

/**
 * D10, et c'est la decision la plus IRREVERSIBLE du document : le delai qui
 * fait foi vit sur la question FIGEE, pas sur la session. La resolution
 * « delai de la question, sinon defaut de session » se fait donc UNE FOIS, au
 * figement, et la valeur resolue est ecrite sur la ligne figee.
 *
 * Si elle se refaisait a chaque lecture, corriger une question en pleine seance
 * changerait le sens des reponses deja donnees.
 */
describe('resoudreLeDelai, mode defi', () => {
  it('prend le delai de la question quand elle en porte un', () => {
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: 45, sessionDefault: 20 })).toEqual({ kind: 'resolu', seconds: 45 });
  });

  it('retombe sur le defaut de la session quand la question n en porte pas', () => {
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: null, sessionDefault: 20 })).toEqual({ kind: 'resolu', seconds: 20 });
  });

  /**
   * ⛔ Ni l'un ni l'autre est un REFUS, et non un repli silencieux sur une
   * valeur inventee. Une seance de defi dont une question n'a aucun delai
   * serait injouable, et le decouvrir devant la classe est le pire moment.
   */
  it('refuse quand ni la question ni la session ne donnent de delai', () => {
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: null, sessionDefault: null })).toEqual({ kind: 'refuse', raison: 'aucun-delai' });
  });

  it('refuse un delai sous le plancher de la spec', () => {
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: TIME_LIMIT_MIN - 1, sessionDefault: 20 })).toEqual({ kind: 'refuse', raison: 'hors-bornes' });
  });

  it('refuse un delai au-dessus du plafond de la spec', () => {
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: TIME_LIMIT_MAX + 1, sessionDefault: 20 })).toEqual({ kind: 'refuse', raison: 'hors-bornes' });
  });

  it('accepte les deux bornes elles-memes', () => {
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: TIME_LIMIT_MIN, sessionDefault: null })).toEqual({ kind: 'resolu', seconds: TIME_LIMIT_MIN });
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: TIME_LIMIT_MAX, sessionDefault: null })).toEqual({ kind: 'resolu', seconds: TIME_LIMIT_MAX });
  });

  /**
   * ⛔ Le defaut de session hors bornes doit AUSSI etre refuse. Le valider
   * seulement a l'ecriture laisserait passer une valeur ecrite en base avant
   * que la borne existe, ou par une ecriture directe.
   */
  it('refuse un defaut de session hors bornes', () => {
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: null, sessionDefault: 500 })).toEqual({ kind: 'refuse', raison: 'hors-bornes' });
  });
});

describe('resoudreLeDelai, mode controle', () => {
  /**
   * ⛔ D6 : le minuteur n'existe QU'EN mode defi. En controle, le delai resolu
   * est null, et ce n'est pas un refus : c'est l'absence de limite qui fait que
   * WCAG 2.2.1 ne s'applique pas a ce mode (spec §8).
   */
  it('rend null, meme quand la question porte un delai', () => {
    expect(
      resoudreLeDelai({ mode: 'controle', questionTimeLimit: 30, sessionDefault: 20 })).toEqual({ kind: 'resolu', seconds: null });
  });

  it('rend null sans refuser quand aucun delai n est donne', () => {
    expect(
      resoudreLeDelai({ mode: 'controle', questionTimeLimit: null, sessionDefault: null })).toEqual({ kind: 'resolu', seconds: null });
  });

  it('ne refuse pas un delai de question hors bornes, puisqu il est ignore', () => {
    expect(
      resoudreLeDelai({ mode: 'controle', questionTimeLimit: 9999, sessionDefault: null })).toEqual({ kind: 'resolu', seconds: null });
  });
});
