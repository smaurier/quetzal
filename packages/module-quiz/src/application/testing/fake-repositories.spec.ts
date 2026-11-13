import { describe, it, expect } from 'vitest';
import { DomainError } from '@quetzal/core';
import {
  JoinCodeAlreadyUsedError,
  ParticipantIndexTakenError,
  ParticipantNotFoundError,
  SessionNotFoundError,
} from '../../domain/errors.js';
import { FakeSessionRepository, frozenQuestionOf, sessionOf } from './fake-repositories.js';

const reponse = (sessionQuestionId: string, participantId: string) => ({
  sessionQuestionId,
  participantId,
  authorGuestId: 'g-1',
  optionId: null,
  value: 'x',
  isCorrect: true,
  elapsedMs: 100,
  points: 1000,
});

interface Mutable {
  status: string;
  points: number;
}

describe('FakeSessionRepository', () => {
  it('refuse un joinCode deja pris', async () => {
    const repo = new FakeSessionRepository();
    const entree = {
      deckId: 'b',
      mode: 'defi' as const,
      maxParticipants: 6,
      defaultTimeLimit: 20,
      guestLocale: null,
      joinCode: 'ABCD1234',
      createdBy: 'u',
    };
    await repo.create(entree);
    await expect(repo.create(entree)).rejects.toBeInstanceOf(JoinCodeAlreadyUsedError);
  });

  const place = (sessionId: string, participantIndex: number, guestId = `g-${String(participantIndex)}`) => ({
    sessionId,
    participantIndex,
    guestId,
    displayName: 'Léa',
  });

  describe('participants', () => {
    it('refuse un participantIndex deja pris dans la seance, erreur de domaine', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      await repo.ajouterParticipant(place('s-1', 1));
      const echec = repo.ajouterParticipant(place('s-1', 1));
      await expect(echec).rejects.toBeInstanceOf(ParticipantIndexTakenError);
      await expect(echec).rejects.toBeInstanceOf(DomainError);
    });

    it('accepte le meme participantIndex dans une autre seance', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      repo.add(sessionOf({ id: 's-2', joinCode: 'ZZZZ9999' }));
      await repo.ajouterParticipant(place('s-1', 1));
      await expect(repo.ajouterParticipant(place('s-2', 1))).resolves.toBeDefined();
    });

    it('rend les participants tries par participantIndex', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      await repo.ajouterParticipant(place('s-1', 3));
      await repo.ajouterParticipant(place('s-1', 1));
      await repo.ajouterParticipant(place('s-1', 2));
      const session = await repo.findById('s-1');
      expect(session?.participants.map((p) => p.participantIndex)).toEqual([1, 2, 3]);
    });

    it('cree le participant avec son premier membre, que l invite retrouve', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      const cree = await repo.ajouterParticipant(place('s-1', 1, 'g-7'));
      expect(cree.memberNames).toEqual(['Léa']);
      const retrouve = await repo.findParticipantByGuest({ sessionId: 's-1', guestId: 'g-7' });
      expect(retrouve?.id).toBe(cree.id);
      expect(retrouve?.memberNames).toEqual(['Léa']);
    });

    it('un index refuse ne laisse ni participant ni membre', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      await repo.ajouterParticipant(place('s-1', 1, 'g-1'));
      await expect(repo.ajouterParticipant(place('s-1', 1, 'g-2'))).rejects.toBeInstanceOf(ParticipantIndexTakenError);
      expect(await repo.findParticipantByGuest({ sessionId: 's-1', guestId: 'g-2' })).toBeNull();
      expect((await repo.findById('s-1'))?.participants).toHaveLength(1);
    });
  });

  describe('questions', () => {
    it('rend les questions triees par rank', async () => {
      const repo = new FakeSessionRepository();
      repo.add(
        sessionOf({ id: 's-1', questions: [frozenQuestionOf(3), frozenQuestionOf(1), frozenQuestionOf(2)] }));
      const session = await repo.findById('s-1');
      expect(session?.questions.map((q) => q.rank)).toEqual([1, 2, 3]);
    });

    it('trie aussi apres demarrer', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1', questions: [] }));
      const { id: _a, ...deux } = frozenQuestionOf(2);
      const { id: _b, ...un } = frozenQuestionOf(1);
      await repo.demarrer('s-1', [deux, un]);
      const session = await repo.findById('s-1');
      expect(session?.questions.map((q) => q.rank)).toEqual([1, 2]);
    });
  });

  /**
   * `demarrer` fige les questions ET passe la seance en cours, en une ecriture.
   * La base refuse un rang deja fige dans la seance (@@unique([sessionId, rank,
   * tenantId])) et annule alors tout : la doublure fait pareil, au lieu de
   * remplacer les questions comme le faisait freezeQuestions.
   */
  describe('demarrer', () => {
    const sans = (rank: number, prompt = `Q${String(rank)}`) => {
      const { id: _id, ...question } = frozenQuestionOf(rank, { prompt });
      return question;
    };

    it('fige les questions et passe la seance en cours', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1', status: 'ouverte', questions: [] }));
      await repo.demarrer('s-1', [sans(1), sans(2)]);
      const session = await repo.findById('s-1');
      expect(session?.status).toBe('en-cours');
      expect(session?.questions.map((q) => q.rank)).toEqual([1, 2]);
    });

    it('un rang en double dans le lot ne fige rien et ne change pas le statut', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1', status: 'ouverte', questions: [] }));
      await expect(repo.demarrer('s-1', [sans(1), sans(1)])).rejects.toThrow();
      const session = await repo.findById('s-1');
      expect(session?.status).toBe('ouverte');
      expect(session?.questions).toEqual([]);
    });

    it('un second demarrage est refuse et laisse le premier figement intact', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1', status: 'ouverte', questions: [] }));
      await repo.demarrer('s-1', [sans(1, 'avant')]);
      await expect(repo.demarrer('s-1', [sans(1, 'apres')])).rejects.toThrow();
      expect((await repo.findById('s-1'))?.questions.map((q) => q.prompt)).toEqual(['avant']);
    });

    it('refuse une seance inconnue par SessionNotFoundError', async () => {
      const repo = new FakeSessionRepository();
      await expect(repo.demarrer('fantome', [sans(1)])).rejects.toBeInstanceOf(SessionNotFoundError);
    });
  });

  describe('copies defensives', () => {
    it('muter la session rendue ne change pas ce que la doublure relit', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      const rendue = await repo.findById('s-1');
      if (rendue === null) throw new Error('session absente');
      (rendue as unknown as Mutable).status = 'terminee';
      (rendue.questions as unknown[]).length = 0;
      const relue = await repo.findById('s-1');
      expect(relue?.status).toBe('ouverte');
      expect(relue?.questions).toHaveLength(2);
    });

    it('muter la session passee a add ne change pas ce que la doublure stocke', async () => {
      const repo = new FakeSessionRepository();
      const session = sessionOf({ id: 's-1' });
      repo.add(session);
      (session as unknown as Mutable).status = 'terminee';
      expect((await repo.findById('s-1'))?.status).toBe('ouverte');
    });

    it('findByJoinCode et list rendent aussi des copies', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      const parCode = await repo.findByJoinCode('ABCD1234');
      const liste = await repo.list();
      (parCode as unknown as Mutable).status = 'terminee';
      (liste[0] as unknown as Mutable).status = 'terminee';
      expect((await repo.findById('s-1'))?.status).toBe('ouverte');
    });

    it('les Date passees et rendues sont des copies', async () => {
      const repo = new FakeSessionRepository();
      const session = sessionOf({ id: 's-1' });
      repo.add(session);
      const sqId = session.questions[0]?.id ?? '';
      const ouverture = new Date('2026-11-13T10:00:00Z');
      await repo.openQuestion({ sessionQuestionId: sqId, openedAt: ouverture, deadlineAt: null });
      ouverture.setUTCFullYear(2000);
      const date = (await repo.findById('s-1'))?.questions[0]?.openedAt;
      expect(date?.toISOString()).toBe('2026-11-13T10:00:00.000Z');
      date?.setUTCFullYear(1990);
      const relue = (await repo.findById('s-1'))?.questions[0]?.openedAt;
      expect(relue?.toISOString()).toBe('2026-11-13T10:00:00.000Z');
    });

    it('muter une reponse rendue ne change pas les reponses stockees', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      const sqId = (await repo.findById('s-1'))?.questions[0]?.id ?? '';
      const participant = await repo.ajouterParticipant(place('s-1', 1));
      const ligne = await repo.enregistrerReponse(reponse(sqId, participant.id));
      if (ligne === null) throw new Error('reponse refusee');
      ligne.points = 0;
      ((await repo.answersFor(sqId))[0] as unknown as Mutable).points = -1;
      ((await repo.allAnswers('s-1'))[0] as unknown as Mutable).points = -2;
      expect((await repo.answersFor(sqId))[0]?.points).toBe(1000);
    });
  });

  describe('reponses', () => {
    async function avecUnParticipant() {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      const participant = await repo.ajouterParticipant(place('s-1', 1));
      const sqId = (await repo.findById('s-1'))?.questions[0]?.id ?? '';
      const score = async () => (await repo.findById('s-1'))?.participants[0]?.score;
      return { repo, participant, sqId, score };
    }

    it('refuse une seconde reponse du meme participant a la meme question', async () => {
      const { repo, participant, sqId } = await avecUnParticipant();
      expect(await repo.enregistrerReponse(reponse(sqId, participant.id))).not.toBeNull();
      expect(await repo.enregistrerReponse(reponse(sqId, participant.id))).toBeNull();
    });

    it('ajoute les points d une reponse acceptee au score du participant', async () => {
      const { repo, participant, sqId, score } = await avecUnParticipant();
      await repo.enregistrerReponse(reponse(sqId, participant.id));
      expect(await score()).toBe(1000);
    });

    it('refuse un participant inconnu, comme la base, sans rien ecrire', async () => {
      const { repo, sqId } = await avecUnParticipant();
      const echec = repo.enregistrerReponse(reponse(sqId, 'participant-fantome'));
      await expect(echec).rejects.toBeInstanceOf(ParticipantNotFoundError);
      expect(await repo.answersFor(sqId)).toEqual([]);
    });

    it('une reponse en double ne touche pas au score', async () => {
      const { repo, participant, sqId, score } = await avecUnParticipant();
      await repo.enregistrerReponse(reponse(sqId, participant.id));
      await repo.enregistrerReponse(reponse(sqId, participant.id));
      expect(await score()).toBe(1000);
    });
  });

  describe('preparation hors port', () => {
    it('poserReponse pose une reponse sans toucher au score', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({
        id: 's-1',
        participants: [{ id: 'p-1', participantIndex: 1, name: null, score: 2200, memberNames: ['Ana'] }],
      }));
      const sqId = (await repo.findById('s-1'))?.questions[0]?.id ?? '';
      const posee = repo.poserReponse(reponse(sqId, 'p-1'));
      expect(await repo.answersFor(sqId)).toEqual([posee]);
      expect((await repo.findById('s-1'))?.participants[0]?.score).toBe(2200);
    });

    it('poserReponse n exige pas de participant', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      const sqId = (await repo.findById('s-1'))?.questions[0]?.id ?? '';
      repo.poserReponse(reponse(sqId, 'p-absent'));
      expect(await repo.allAnswers('s-1')).toHaveLength(1);
    });

    it('la reponse posee compte pour l unicite', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      const participant = await repo.ajouterParticipant(place('s-1', 1));
      const sqId = (await repo.findById('s-1'))?.questions[0]?.id ?? '';
      repo.poserReponse(reponse(sqId, participant.id));
      expect(await repo.enregistrerReponse(reponse(sqId, participant.id))).toBeNull();
      expect((await repo.findById('s-1'))?.participants[0]?.score).toBe(0);
    });
  });
});
