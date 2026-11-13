import { describe, it, expect } from 'vitest';
import { SessionClosedToJoinError, SessionFullError, SessionNotFoundError } from '../domain/errors.js';
import { JoinSessionUseCase } from './join-session.use-case.js';
import { FakeSessionRepository, sessionOf } from './testing/fake-repositories.js';

function build() {
  const sessions = new FakeSessionRepository();
  const useCase = new JoinSessionUseCase(sessions);
  return { sessions, useCase };
}

describe('JoinSessionUseCase', () => {
  it('attribue un participant au premier invite', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 6, participants: [] }));

    const r = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });

    expect(r.participantIndex).toBe(1);
  });

  it('attribue des participants differents a deux invites, en mode solo', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 6, participants: [] }));

    const a = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });
    const b = await useCase.execute({ sessionId: 'session-1', guestId: 'g-2', displayName: 'Bea' });

    expect(a.participantId).not.toBe(b.participantId);
    expect([a.participantIndex, b.participantIndex]).toEqual([1, 2]);
  });

  /**
   * ⛔ LA REGLE QUI SAUVE LA SEANCE. Spec §5.4 : « une reconnexion aboutit
   * toujours ». Un meme guestId doit retrouver SON participant, avec son score,
   * et surtout ne pas en consommer un second, sinon trois coupures wifi par
   * eleve epuisent le plafond en pleine seance.
   */
  it('rend le MEME participant a une reconnexion du meme invite', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 6, participants: [] }));

    const premiere = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });
    const seconde = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });

    expect(seconde.participantId).toBe(premiere.participantId);
    expect((await sessions.findById('session-1'))?.participants).toHaveLength(1);
  });

  it('laisse entrer sur une seance DEJA en cours', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'en-cours', maxParticipants: 6, participants: [] }));

    await expect(
      useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' })).resolves.toMatchObject({ participantIndex: 1 });
  });

  it('refuse sur un brouillon', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'brouillon' }));

    await expect(
      useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' })).rejects.toThrow(SessionClosedToJoinError);
  });

  it('refuse sur une seance terminee', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'terminee' }));

    await expect(
      useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' })).rejects.toThrow(SessionClosedToJoinError);
  });

  it('refuse une seance inconnue', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ sessionId: 'fantome', guestId: 'g-1', displayName: 'Ana' })).rejects.toThrow(SessionNotFoundError);
  });

  /**
   * ⛔ Le plafond est celui de la SEANCE (`maxParticipants`), distinct du
   * plafond d'invites du manifeste applique a /api/guest-token (issue #75). Les
   * deux existent et ne mesurent pas la meme chose : en mode equipes, dix
   * invites peuvent tenir dans trois participants.
   */
  it('refuse un participant de trop quand la seance est pleine', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 2, participants: [] }));

    await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });
    await useCase.execute({ sessionId: 'session-1', guestId: 'g-2', displayName: 'Bea' });

    await expect(
      useCase.execute({ sessionId: 'session-1', guestId: 'g-3', displayName: 'Cal' })).rejects.toThrow(SessionFullError);
  });

  /**
   * ⛔ Et une RECONNEXION aboutit meme sur une seance pleine : l'eleve a deja
   * sa place, la lui refuser serait l'exclure pour une coupure reseau.
   */
  it('laisse revenir un invite deja present, meme seance pleine', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 1, participants: [] }));

    const premiere = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });
    const retour = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });

    expect(retour.participantId).toBe(premiere.participantId);
  });

  it('prend le rang le plus haut plus un, et non le nombre de participants', async () => {
    const { useCase, sessions } = build();
    // Un trou de rang : ce que laisse un participant retire a la main.
    sessions.add(sessionOf({
      status: 'ouverte',
      maxParticipants: 6,
      participants: [
        { id: 'p-1', participantIndex: 1, name: null, score: 0, memberNames: [] },
        { id: 'p-7', participantIndex: 7, name: null, score: 0, memberNames: [] },
      ],
    }));

    const r = await useCase.execute({ sessionId: 'session-1', guestId: 'g-9', displayName: 'Dan' });

    expect(r.participantIndex, 'le plus haut plus un, jamais le compte').toBe(8);
  });
});
