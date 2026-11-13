import { describe, it, expect } from 'vitest';
import {
  ParticipantIndexTakenError,
  SessionClosedToJoinError,
  SessionFullError,
  SessionNotFoundError,
} from '../domain/errors.js';
import type { Participant } from '../domain/ports/session.repository.js';
import { JoinSessionUseCase } from './join-session.use-case.js';
import { FakeSessionRepository, sessionOf } from './testing/fake-repositories.js';

type NouveauParticipant = Parameters<FakeSessionRepository['ajouterParticipant']>[0];

function build(): { sessions: FakeSessionRepository; useCase: JoinSessionUseCase };
function build<R extends FakeSessionRepository>(sessions: R): { sessions: R; useCase: JoinSessionUseCase };
function build(sessions: FakeSessionRepository = new FakeSessionRepository()) {
  const useCase = new JoinSessionUseCase(sessions);
  return { sessions, useCase };
}

/** Un autre invité entre au même index entre la lecture et l'écriture. */
class SessionsOuUnRivalPasseDevant extends FakeSessionRepository {
  readonly indexTentes: number[] = [];

  override async ajouterParticipant(input: NouveauParticipant): Promise<Participant> {
    this.indexTentes.push(input.participantIndex);
    if (this.indexTentes.length === 1) {
      await super.ajouterParticipant({ ...input, guestId: 'g-rival', displayName: 'Rival' });
      throw new ParticipantIndexTakenError(input.participantIndex);
    }
    return super.ajouterParticipant(input);
  }
}

/** Le même invité, sur un second onglet ou une reconnexion, gagne la course. */
class SessionsOuLeMemeInvitePasseDevant extends FakeSessionRepository {
  appels = 0;

  override async ajouterParticipant(input: NouveauParticipant): Promise<Participant> {
    this.appels += 1;
    if (this.appels === 1) {
      await super.ajouterParticipant(input);
      throw new ParticipantIndexTakenError(input.participantIndex);
    }
    return super.ajouterParticipant(input);
  }
}

class SessionsAuxIndexToujoursPris extends FakeSessionRepository {
  readonly refus: ParticipantIndexTakenError[] = [];

  override async ajouterParticipant(input: NouveauParticipant): Promise<never> {
    const refus = new ParticipantIndexTakenError(input.participantIndex);
    this.refus.push(refus);
    throw refus;
  }
}

class SessionsEnPanne extends FakeSessionRepository {
  appels = 0;
  readonly panne = new Error('base injoignable');

  override async ajouterParticipant(): Promise<never> {
    this.appels += 1;
    throw this.panne;
  }
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

  /**
   * ⛔ L'ecran de fin a besoin de l'identite de l'eleve pour lui montrer son
   * resultat : une reconnexion aboutit meme sur une seance terminee. Une
   * PREMIERE entree, elle, y reste refusee.
   */
  it('rend sa place a un invite deja present meme sur une seance terminee', async () => {
    const { useCase, sessions } = build();
    sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 6, participants: [] }));
    const premiere = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });
    await sessions.setStatus('session-1', 'terminee');

    const retour = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });

    expect(retour).toEqual({ participantId: premiere.participantId, participantIndex: 1, retour: true });
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

  /**
   * ⛔ Deux eleves qui scannent le QR a la meme seconde lisent le meme rang
   * libre. Seule l'unicite en base tranche ; le perdant ne doit pas voir une
   * erreur, il prend le rang suivant.
   */
  describe('quand une autre entree prend le meme index', () => {
    it('retente au rang suivant au lieu de faire echouer l eleve', async () => {
      const { useCase, sessions } = build(new SessionsOuUnRivalPasseDevant());
      sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 6, participants: [] }));

      const r = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });

      expect(sessions.indexTentes).toEqual([1, 2]);
      expect(r).toMatchObject({ participantIndex: 2, retour: false });
      expect((await sessions.findById('session-1'))?.participants).toHaveLength(2);
    });

    /**
     * ⛔ Si c'est le MEME invite qui a gagne la course (deux reconnexions
     * simultanees), retenter un autre index lui donnerait deux participants :
     * son score coupe en deux, et une place de trop consommee. On relit
     * d'abord sa place.
     */
    it('rend la place deja prise par le meme invite, sans doublon', async () => {
      const { useCase, sessions } = build(new SessionsOuLeMemeInvitePasseDevant());
      sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 6, participants: [] }));

      const r = await useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });

      const participants = (await sessions.findById('session-1'))?.participants;
      expect(participants).toHaveLength(1);
      expect(r).toEqual({ participantId: participants?.[0]?.id, participantIndex: 1, retour: true });
      expect(sessions.appels).toBe(1);
    });

    it('revérifie le plafond quand le rival a pris la derniere place', async () => {
      const { useCase, sessions } = build(new SessionsOuUnRivalPasseDevant());
      sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 1, participants: [] }));

      await expect(
        useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' })).rejects.toThrow(SessionFullError);
      expect(sessions.indexTentes).toEqual([1]);
      expect((await sessions.findById('session-1'))?.participants).toHaveLength(1);
    });

    it('abandonne apres dix essais en relancant le dernier refus', async () => {
      const { useCase, sessions } = build(new SessionsAuxIndexToujoursPris());
      sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 6, participants: [] }));

      const echec = useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' });

      await expect(echec).rejects.toBeInstanceOf(ParticipantIndexTakenError);
      expect(sessions.refus).toHaveLength(10);
      await expect(echec).rejects.toBe(sessions.refus[9]);
    });

    it('laisse remonter intacte toute autre erreur, sans retenter', async () => {
      const { useCase, sessions } = build(new SessionsEnPanne());
      sessions.add(sessionOf({ status: 'ouverte', maxParticipants: 6, participants: [] }));

      await expect(
        useCase.execute({ sessionId: 'session-1', guestId: 'g-1', displayName: 'Ana' })).rejects.toBe(sessions.panne);
      expect(sessions.appels).toBe(1);
    });
  });
});
