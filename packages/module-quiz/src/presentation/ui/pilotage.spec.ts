import { describe, expect, it } from 'vitest';
import {
  actionPrincipale,
  cleErreurDeCommande,
  cleErreurDeSalle,
  apresFermeture,
  doitFermerAZero,
  ESSAIS_DE_FERMETURE_MAX,
  etatDeSeance,
  fermetureDemandee,
  issueDeFermeture,
  SUIVI_VIDE,
} from './pilotage.js';
import type { FermetureVue, SessionVue } from './quiz-socket-state.js';

/**
 * La logique de l'ecran animatrice, sortie du JSX pour etre prouvable.
 */

function session(partiel: Partial<SessionVue> = {}): SessionVue {
  return {
    id: 's1',
    status: 'en-cours',
    mode: 'defi',
    joinCode: 'ABC123',
    questionCount: 3,
    participants: [],
    ...partiel,
  };
}

const ouverte = { sessionQuestionId: 'q2', rank: 2 };

function fermee(rank: number): FermetureVue {
  return { sessionQuestionId: `q${String(rank)}`, rank, answerCount: 0, correctCount: 0 };
}

describe('actionPrincipale', () => {
  it('ouvre les entrees d une seance en preparation', () => {
    expect(actionPrincipale(session({ status: 'brouillon' }), null, null)).toBe('open');
  });

  it('commence une seance dont les entrees sont ouvertes', () => {
    expect(actionPrincipale(session({ status: 'ouverte' }), null, null)).toBe('start');
  });

  it('ferme la question ouverte', () => {
    expect(actionPrincipale(session(), ouverte, null)).toBe('close');
  });

  it('propose la premiere question d une seance commencee', () => {
    expect(actionPrincipale(session(), null, null)).toBe('next');
  });

  it('propose la suivante apres une question fermee', () => {
    expect(actionPrincipale(session(), null, fermee(2))).toBe('next');
  });

  /** Sinon le serveur repond 409 `no_question_left` a un bouton qu on n aurait pas du montrer. */
  it('ne propose plus rien quand la derniere question est fermee', () => {
    expect(actionPrincipale(session(), null, fermee(3))).toBeNull();
  });

  it('ne propose rien sur une seance terminee', () => {
    expect(actionPrincipale(session({ status: 'terminee' }), null, null)).toBeNull();
  });
});

/**
 * RGAA 3.1 / WCAG 1.4.1 : l'etat se lit en TEXTE, jamais par la seule couleur
 * d'un bouton ou d'un bandeau.
 */
describe('etatDeSeance', () => {
  it('dit qu une seance en preparation n accepte encore personne', () => {
    expect(etatDeSeance(session({ status: 'brouillon' }), null, null)).toEqual({ cle: 'statusDraft', valeurs: {} });
  });

  it('dit que les entrees sont ouvertes', () => {
    expect(etatDeSeance(session({ status: 'ouverte' }), null, null)).toEqual({ cle: 'statusOpen', valeurs: {} });
  });

  it('nomme la question ouverte et le total', () => {
    expect(etatDeSeance(session(), ouverte, null)).toEqual({ cle: 'statusQuestionOpen', valeurs: { rank: 2, total: 3 } });
  });

  it('nomme la question fermee', () => {
    expect(etatDeSeance(session(), null, fermee(2))).toEqual({ cle: 'statusQuestionClosed', valeurs: { rank: 2, total: 3 } });
  });

  it('dit que toutes les questions ont ete jouees', () => {
    expect(etatDeSeance(session(), null, fermee(3))).toEqual({ cle: 'statusAllPlayed', valeurs: { total: 3 } });
  });

  it('dit qu une seance commencee attend sa premiere question', () => {
    expect(etatDeSeance(session(), null, null)).toEqual({ cle: 'statusStarted', valeurs: {} });
  });

  it('dit que la seance est terminee', () => {
    expect(etatDeSeance(session({ status: 'terminee' }), null, null)).toEqual({ cle: 'statusFinished', valeurs: {} });
  });
});

/**
 * D8 : le navigateur de l'animatrice ferme la question a zero. Une fois
 * qu'elle a abouti, jamais deux ; mais une fermeture perdue (commande en vol
 * au zero, reseau, 5xx) laisserait la question ouverte sans que personne le
 * sache : elle se retente, un nombre borne de fois.
 */
describe('doitFermerAZero', () => {
  const zero = (suivi = SUIVI_VIDE, partiel: { questionOuverteId?: string | null; commandeEnCours?: boolean } = {}) =>
    doitFermerAZero({
      sessionQuestionId: 'q1',
      questionOuverteId: partiel.questionOuverteId === undefined ? 'q1' : partiel.questionOuverteId,
      suivi,
      commandeEnCours: partiel.commandeEnCours ?? false,
    });

  it('ferme la premiere fois que le decompte d une question atteint zero', () => {
    expect(zero()).toBe(true);
  });

  it('ne redemande pas la fermeture tant que la requete est partie', () => {
    expect(zero(fermetureDemandee(SUIVI_VIDE, 'q1'))).toBe(false);
  });

  /**
   * ⛔ `questions/close` ferme LA question ouverte, sans la nommer : pendant
   * une commande en vol, N+1 est peut-etre deja ouverte en base. S'abstenir,
   * puis retenter quand la commande est finie : rien n'a ete enregistre.
   */
  it('s abstient pendant une commande en vol, puis ferme quand elle est finie', () => {
    expect(zero(SUIVI_VIDE, { commandeEnCours: true })).toBe(false);
    expect(zero(SUIVI_VIDE, { commandeEnCours: false })).toBe(true);
  });

  /** La commande en vol etait « suivante » : N+1 est ouverte, la fermer serait l avoir volee. */
  it('ne ferme jamais une question qui n est plus l ouverte', () => {
    expect(zero(SUIVI_VIDE, { questionOuverteId: 'q2' })).toBe(false);
    expect(zero(SUIVI_VIDE, { questionOuverteId: null })).toBe(false);
  });

  it('retente une fermeture qui a echoue', () => {
    const suivi = apresFermeture(fermetureDemandee(SUIVI_VIDE, 'q1'), 'q1', 'echec');

    expect(zero(suivi)).toBe(true);
  });

  it('ne retente ni une fermeture aboutie, ni une question deja fermee', () => {
    expect(zero(apresFermeture(fermetureDemandee(SUIVI_VIDE, 'q1'), 'q1', 'fermee'))).toBe(false);
    expect(zero(apresFermeture(fermetureDemandee(SUIVI_VIDE, 'q1'), 'q1', 'deja-fermee'))).toBe(false);
  });

  it('cesse de retenter apres le nombre maximal d essais', () => {
    let suivi = SUIVI_VIDE;
    for (let essai = 0; essai < ESSAIS_DE_FERMETURE_MAX; essai += 1) {
      expect(zero(suivi)).toBe(true);
      suivi = apresFermeture(fermetureDemandee(suivi, 'q1'), 'q1', 'echec');
    }

    expect(zero(suivi)).toBe(false);
  });

  it('ne partage pas le suivi d une question avec une autre', () => {
    const suivi = fermetureDemandee(SUIVI_VIDE, 'q1');

    expect(doitFermerAZero({ sessionQuestionId: 'q2', questionOuverteId: 'q2', suivi, commandeEnCours: false })).toBe(true);
  });
});

describe('issueDeFermeture', () => {
  it('dit qu une reponse ok a ferme la question', () => {
    expect(issueDeFermeture(true, null)).toBe('fermee');
  });

  /** 409 `no_question_open` : Elda a ferme a la main, ou une autre fenetre l a fait. */
  it('dit qu un refus « aucune question ouverte » veut dire deja fermee', () => {
    expect(issueDeFermeture(false, 'errorNoQuestionOpen')).toBe('deja-fermee');
  });

  it('compte tout autre refus comme un echec', () => {
    expect(issueDeFermeture(false, 'errorGeneric')).toBe('echec');
    expect(issueDeFermeture(false, null)).toBe('echec');
  });
});

describe('cleErreurDeCommande', () => {
  it.each([
    ['no_question_left', 'errorNoQuestionLeft'],
    ['no_question_open', 'errorNoQuestionOpen'],
    ['empty_bank', 'errorEmptyBank'],
    ['session_bank_deleted', 'errorBankDeleted'],
    ['invalid_session_transition', 'errorTransition'],
    ['time_limit_unresolvable', 'errorTimeLimit'],
  ])('traduit le refus %s', (code, cle) => {
    expect(cleErreurDeCommande(409, { error: code, message: 'x' })).toBe(cle);
  });

  it('dit qu une seance introuvable est introuvable', () => {
    expect(cleErreurDeCommande(404, { error: 'session_not_found' })).toBe('errorNotFound');
  });

  /** Jamais le code brut a l ecran : il serait projete devant la classe. */
  it('rend un message generique pour un refus inconnu ou un corps illisible', () => {
    expect(cleErreurDeCommande(409, { error: 'quelque_chose' })).toBe('errorGeneric');
    expect(cleErreurDeCommande(500, null)).toBe('errorGeneric');
    expect(cleErreurDeCommande(400, 'texte')).toBe('errorGeneric');
  });
});

describe('cleErreurDeSalle', () => {
  it('dit qu une seance introuvable est introuvable', () => {
    expect(cleErreurDeSalle('SessionNotFoundError')).toBe('errorNotFound');
  });

  it('rend un message generique pour toute autre raison', () => {
    expect(cleErreurDeSalle('InternalError')).toBe('errorGeneric');
  });
});
