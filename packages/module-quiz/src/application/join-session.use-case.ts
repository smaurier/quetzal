import { Injectable } from '@nestjs/common';
import {
  ParticipantIndexTakenError,
  SessionClosedToJoinError,
  SessionFullError,
  SessionNotFoundError,
} from '../domain/errors.js';
import { peutRejoindre } from '../domain/session-status.js';
import type { SessionRepository } from '../domain/ports/session.repository.js';

const ESSAIS_D_ENTREE = 10;

export interface PlaceAttribuee {
  participantId: string;
  participantIndex: number;
  /** Vrai quand l'invité retrouve une place qu'il avait déjà. */
  retour: boolean;
}

@Injectable()
export class JoinSessionUseCase {
  constructor(private readonly sessions: SessionRepository) {}

  async execute(input: {
    sessionId: string;
    guestId: string;
    displayName: string;
  }): Promise<PlaceAttribuee> {
    // Tout est relu à chaque essai : une entrée concurrente au même index peut
    // venir du MÊME invité (deux reconnexions simultanées), et retenter à
    // l'aveugle lui donnerait un second participant.
    for (let essai = 1; ; essai += 1) {
      try {
        return await this.entrer(input);
      } catch (erreur) {
        if (!(erreur instanceof ParticipantIndexTakenError) || essai === ESSAIS_D_ENTREE) throw erreur;
      }
    }
  }

  private async entrer(input: {
    sessionId: string;
    guestId: string;
    displayName: string;
  }): Promise<PlaceAttribuee> {
    const session = await this.sessions.findById(input.sessionId);
    if (session === null) throw new SessionNotFoundError(input.sessionId);

    // ⛔ La reconnexion est cherchée AVANT le plafond : un élève qui a déjà sa
    // place doit la retrouver même sur une séance pleine. L'ordre inverse
    // l'exclurait pour une coupure réseau, sur un wifi d'établissement peu
    // fiable, le scénario de référence. Et AVANT le statut : l'écran de fin d'une
    // séance terminée a besoin de l'identité de l'élève pour son résultat.
    const deja = await this.sessions.findParticipantByGuest({
      sessionId: session.id,
      guestId: input.guestId,
    });
    if (deja !== null) {
      return { participantId: deja.id, participantIndex: deja.participantIndex, retour: true };
    }

    if (!peutRejoindre(session.status)) throw new SessionClosedToJoinError(session.status);
    if (session.participants.length >= session.maxParticipants) {
      throw new SessionFullError(session.maxParticipants);
    }

    // Le rang le plus haut plus un, et non le nombre de participants : les rangs
    // ont des trous après un retrait, et `@@unique([sessionId, participantIndex,
    // tenantId])` refuserait un doublon.
    const rang =
      session.participants.reduce((haut, p) => Math.max(haut, p.participantIndex), 0) + 1;

    const participant = await this.sessions.ajouterParticipant({
      sessionId: session.id,
      participantIndex: rang,
      guestId: input.guestId,
      displayName: input.displayName,
    });

    return { participantId: participant.id, participantIndex: rang, retour: false };
  }
}
