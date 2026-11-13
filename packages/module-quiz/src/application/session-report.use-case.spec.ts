import { describe, it, expect } from 'vitest';
import { SessionNotFoundError } from '../domain/errors.js';
import type { NewAnswer } from '../domain/ports/session.repository.js';
import { SessionReportUseCase, construireClassement } from './session-report.use-case.js';
import { FakeSessionRepository, frozenQuestionOf, sessionOf } from './testing/fake-repositories.js';

const T0 = 1_700_000_000_000;

function reponse(
  sessionQuestionId: string,
  participantId: string,
  authorGuestId: string,
  isCorrect: boolean,
  elapsedMs: number,
  points: number): NewAnswer {
  return {
    sessionQuestionId, participantId, authorGuestId, isCorrect, elapsedMs, points,
    optionId: null, value: null,
  };
}

function seanceJouee(deckId: string | null = 'bank-1') {
  const sessions = new FakeSessionRepository();
  const q1 = frozenQuestionOf(1, { prompt: 'Chaise ?', openedAt: new Date(T0), closedAt: new Date(T0 + 20_000) });
  const q2 = frozenQuestionOf(2, { prompt: 'Table ?', openedAt: new Date(T0 + 30_000), closedAt: new Date(T0 + 50_000) });
  sessions.add(sessionOf({
    deckId,
    status: 'terminee',
    questions: [q1, q2],
    participants: [
      { id: 'p-1', participantIndex: 1, name: 'Les lynx', score: 2200, memberNames: ['Ana'] },
      { id: 'p-2', participantIndex: 2, name: null, score: 1000, memberNames: ['Bea', 'Cal'] },
      { id: 'p-3', participantIndex: 3, name: null, score: 0, memberNames: ['Dan'] },
    ],
  }));

  // p-1 : juste aux deux. p-2 : juste a la premiere, absente a la seconde.
  // p-3 : fausse a la premiere, absente a la seconde.
  sessions.poserReponse(reponse(q1.id, 'p-1', 'g-1', true, 1200, 1200));
  sessions.poserReponse(reponse(q2.id, 'p-1', 'g-1', true, 1000, 1000));
  sessions.poserReponse(reponse(q1.id, 'p-2', 'g-2', true, 9000, 1000));
  sessions.poserReponse(reponse(q1.id, 'p-3', 'g-4', false, 4000, 0));

  return { sessions, q1, q2, useCase: new SessionReportUseCase(sessions) };
}

function classementDe(participants: { id: string; index: number; name: string | null; score: number }[]) {
  const sessions = new FakeSessionRepository();
  const q1 = frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: new Date(T0 + 20_000) });
  sessions.add(sessionOf({
    status: 'terminee',
    questions: [q1],
    participants: participants.map((p) => ({
      id: p.id, participantIndex: p.index, name: p.name, score: p.score, memberNames: [`m-${p.id}`],
    })),
  }));
  return { sessions, q1, useCase: new SessionReportUseCase(sessions) };
}

describe('SessionReportUseCase', () => {
  it('refuse une seance inconnue', async () => {
    const { useCase } = seanceJouee();

    await expect(useCase.execute({ sessionId: 'fantome' })).rejects.toThrow(SessionNotFoundError);
  });

  it('classe les participants par score decroissant', async () => {
    const { useCase } = seanceJouee();

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.classement.map((l) => l.participantId)).toEqual(['p-1', 'p-2', 'p-3']);
  });

  it('classe par score, pas par ordre d arrivee', async () => {
    const { useCase } = classementDe([
      { id: 'a', index: 1, name: 'A', score: 100 },
      { id: 'b', index: 2, name: 'B', score: 900 },
      { id: 'c', index: 3, name: 'C', score: 500 },
    ]);

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.classement.map((l) => l.participantId)).toEqual(['b', 'c', 'a']);
  });

  /**
   * Le depart des ex aequo est une regle, pas un hasard : un classement qui
   * change d'ordre a chaque rechargement se lit mal sur un videoprojecteur.
   * Ordre : score, puis reponses justes, puis label, puis numero d'arrivee.
   */
  it('departage les ex aequo par les reponses justes', async () => {
    const { sessions, q1, useCase } = classementDe([
      { id: 'a', index: 1, name: 'A', score: 500 },
      { id: 'b', index: 2, name: 'B', score: 500 },
    ]);
    sessions.poserReponse(reponse(q1.id, 'a', 'g-a', false, 100, 0));
    sessions.poserReponse(reponse(q1.id, 'b', 'g-b', true, 100, 500));

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.classement.map((l) => l.participantId)).toEqual(['b', 'a']);
  });

  it('departage a score et justes egaux par le label', async () => {
    const { useCase } = classementDe([
      { id: 'z', index: 1, name: 'Zebres', score: 500 },
      { id: 'a', index: 2, name: 'Abeilles', score: 500 },
    ]);

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.classement.map((l) => l.participantId)).toEqual(['a', 'z']);
  });

  it('departage deux labels identiques par le numero d arrivee, jamais par l ordre recu', () => {
    const participant = (id: string, participantIndex: number) =>
      ({ id, participantIndex, name: 'Lynx', score: 500, memberNames: ['m'] });

    const classement = construireClassement([participant('tard', 2), participant('tot', 1)], [], []);

    expect(classement.map((l) => l.participantId)).toEqual(['tot', 'tard']);
  });

  /**
   * Ce que la spec §1 appelle le vrai manque de la plateforme : savoir
   * QUELLE QUESTION a echoue.
   */
  it('rend le taux de reussite par question, pour dire laquelle a echoue', async () => {
    const { useCase } = seanceJouee();

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.questions[0]).toMatchObject({
      rank: 1, prompt: 'Chaise ?', answerCount: 3, correctCount: 2,
    });
    expect(rapport.questions[1]).toMatchObject({
      rank: 2, prompt: 'Table ?', answerCount: 1, correctCount: 1,
    });
  });

  /**
   * Une reponse de grace est une reponse : acceptee apres la fermeture, elle
   * arrive apres l'annonce des comptes (task 12). Le retour, calcule apres
   * coup, doit la compter, sinon il contredirait le score de l'eleve.
   */
  it('compte une reponse de grace arrivee apres la fermeture', async () => {
    const { sessions, q1, useCase } = classementDe([{ id: 'a', index: 1, name: 'A', score: 1000 }]);
    sessions.poserReponse(reponse(q1.id, 'a', 'g-a', true, 20_300, 1000));

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.questions[0]).toMatchObject({ answerCount: 1, correctCount: 1 });
    expect(rapport.classement[0]).toMatchObject({ correctCount: 1, missingCount: 0 });
  });

  /**
   * UNE ABSENCE N'EST PAS UNE ERREUR. Un eleve dont le telephone a lache
   * n'a pas « rate » la question : le confondre avec une faute donnerait a
   * Elda un diagnostic faux, sur le seul ecran qu'elle regarde apres la seance.
   */
  it('distingue une absence de reponse d une reponse fausse', async () => {
    const { useCase } = seanceJouee();

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    const p2 = rapport.classement.find((l) => l.participantId === 'p-2');
    expect(p2).toMatchObject({ correctCount: 1, wrongCount: 0, missingCount: 1 });

    const p3 = rapport.classement.find((l) => l.participantId === 'p-3');
    expect(p3).toMatchObject({ correctCount: 0, wrongCount: 1, missingCount: 1 });
  });

  it('fait apparaitre un participant qui n a jamais repondu', async () => {
    const { sessions, q1, useCase } = classementDe([
      { id: 'a', index: 1, name: 'A', score: 1000 },
      { id: 'muet', index: 2, name: 'Muet', score: 0 },
    ]);
    sessions.poserReponse(reponse(q1.id, 'a', 'g-a', true, 100, 1000));

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.classement.find((l) => l.participantId === 'muet')).toMatchObject({
      score: 0, correctCount: 0, wrongCount: 0, missingCount: 1,
    });
    expect(rapport.participantCount).toBe(2);
  });

  it('nomme le participant par son nom choisi, et derive les autres', async () => {
    const { useCase } = seanceJouee();

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.classement[0]?.label).toBe('Les lynx');
    // Membre unique : son nom. Plusieurs membres : le numero.
    expect(rapport.classement.find((l) => l.participantId === 'p-3')?.label).toBe('Dan');
    expect(rapport.classement.find((l) => l.participantId === 'p-2')?.label).toBe('2');
  });

  /**
   * L'AUTEUR de chaque reponse est rendu, meme en mode equipes (D4) : c'est
   * ce qui permet un retour nominatif sans exclure du jeu l'eleve sans
   * telephone.
   */
  it('rend l auteur de chaque reponse', async () => {
    const { useCase } = seanceJouee();

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.questions[0]?.answers.map((a) => a.authorGuestId).sort()).toEqual([
      'g-1', 'g-2', 'g-4',
    ]);
  });

  it('rend un rapport lisible sur une seance ou personne n a repondu', async () => {
    const sessions = new FakeSessionRepository();
    sessions.add(sessionOf({
      status: 'terminee',
      questions: [frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: new Date(T0 + 1) })],
      participants: [{ id: 'p-1', participantIndex: 1, name: null, score: 0, memberNames: ['Ana'] }],
    }));
    const useCase = new SessionReportUseCase(sessions);

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.questions[0]?.answerCount).toBe(0);
    expect(rapport.classement[0]?.missingCount).toBe(1);
    expect(rapport.questions[0]?.correctCount).toBe(0);
  });

  /**
   * Une question figee mais jamais ouverte n'a pas « echoue » : la compter
   * ferait baisser tous les taux et gonflerait chaque absence.
   */
  it('ignore une question figee jamais ouverte', async () => {
    const sessions = new FakeSessionRepository();
    const jouee = frozenQuestionOf(1, { openedAt: new Date(T0), closedAt: new Date(T0 + 1) });
    const jamais = frozenQuestionOf(2);
    sessions.add(sessionOf({
      status: 'terminee',
      questions: [jouee, jamais],
      participants: [{ id: 'p-1', participantIndex: 1, name: null, score: 0, memberNames: ['Ana'] }],
    }));
    const useCase = new SessionReportUseCase(sessions);

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.questions.map((q) => q.rank)).toEqual([1]);
    expect(rapport.questionCount).toBe(1);
    expect(rapport.classement[0]?.missingCount).toBe(1);
  });

  /**
   * D10 : le retour se lit sur la seance FIGEE. Supprimer la banque met
   * `deckId` a null (tache 6b), et la seance reste lisible, enonces compris.
   */
  it('reste lisible quand la banque a ete supprimee', async () => {
    const { useCase } = seanceJouee(null);

    const rapport = await useCase.execute({ sessionId: 'session-1' });

    expect(rapport.questions.map((q) => q.prompt)).toEqual(['Chaise ?', 'Table ?']);
    expect(rapport.classement).toHaveLength(3);
  });
});
