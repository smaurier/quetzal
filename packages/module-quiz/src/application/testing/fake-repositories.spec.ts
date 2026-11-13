import { describe, it, expect } from 'vitest';
import { DomainError } from '@quetzal/core';
import { JoinCodeAlreadyUsedError, ParticipantIndexTakenError } from '../../domain/errors.js';
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

  describe('participants', () => {
    it('refuse un participantIndex deja pris dans la seance, erreur de domaine', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      await repo.addParticipant({ sessionId: 's-1', participantIndex: 1 });
      const echec = repo.addParticipant({ sessionId: 's-1', participantIndex: 1 });
      await expect(echec).rejects.toBeInstanceOf(ParticipantIndexTakenError);
      await expect(echec).rejects.toBeInstanceOf(DomainError);
    });

    it('accepte le meme participantIndex dans une autre seance', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      repo.add(sessionOf({ id: 's-2', joinCode: 'ZZZZ9999' }));
      await repo.addParticipant({ sessionId: 's-1', participantIndex: 1 });
      await expect(repo.addParticipant({ sessionId: 's-2', participantIndex: 1 })).resolves.toBeDefined();
    });

    it('rend les participants tries par participantIndex', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      await repo.addParticipant({ sessionId: 's-1', participantIndex: 3 });
      await repo.addParticipant({ sessionId: 's-1', participantIndex: 1 });
      await repo.addParticipant({ sessionId: 's-1', participantIndex: 2 });
      const session = await repo.findById('s-1');
      expect(session?.participants.map((p) => p.participantIndex)).toEqual([1, 2, 3]);
    });
  });

  describe('membres', () => {
    async function avecUnParticipant() {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      const participant = await repo.addParticipant({ sessionId: 's-1', participantIndex: 1 });
      return { repo, participant };
    }

    it('garde deux invites distincts de meme nom', async () => {
      const { repo, participant } = await avecUnParticipant();
      await repo.addMember({ participantId: participant.id, guestId: 'g-1', displayName: 'Léa' });
      await repo.addMember({ participantId: participant.id, guestId: 'g-2', displayName: 'Léa' });
      const session = await repo.findById('s-1');
      expect(session?.participants[0]?.memberNames).toEqual(['Léa', 'Léa']);
    });

    it('est idempotent par guestId et garde le premier nom', async () => {
      const { repo, participant } = await avecUnParticipant();
      await repo.addMember({ participantId: participant.id, guestId: 'g-1', displayName: 'Léa' });
      await repo.addMember({ participantId: participant.id, guestId: 'g-1', displayName: 'Léa bis' });
      const session = await repo.findById('s-1');
      expect(session?.participants[0]?.memberNames).toEqual(['Léa']);
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

    it('trie aussi apres freezeQuestions', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1', questions: [] }));
      const { id: _a, ...deux } = frozenQuestionOf(2);
      const { id: _b, ...un } = frozenQuestionOf(1);
      await repo.freezeQuestions('s-1', [deux, un]);
      const session = await repo.findById('s-1');
      expect(session?.questions.map((q) => q.rank)).toEqual([1, 2]);
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
      const ligne = await repo.recordAnswer(reponse(sqId, 'p-1'));
      if (ligne === null) throw new Error('reponse refusee');
      ligne.points = 0;
      ((await repo.answersFor(sqId))[0] as unknown as Mutable).points = -1;
      ((await repo.allAnswers('s-1'))[0] as unknown as Mutable).points = -2;
      expect((await repo.answersFor(sqId))[0]?.points).toBe(1000);
    });
  });

  describe('reponses', () => {
    it('refuse une seconde reponse du meme participant a la meme question', async () => {
      const repo = new FakeSessionRepository();
      repo.add(sessionOf({ id: 's-1' }));
      const sqId = (await repo.findById('s-1'))?.questions[0]?.id ?? '';
      expect(await repo.recordAnswer(reponse(sqId, 'p-1'))).not.toBeNull();
      expect(await repo.recordAnswer(reponse(sqId, 'p-1'))).toBeNull();
    });
  });
});
