import { Inject, Injectable } from '@nestjs/common';
import { rooms } from '@quetzal/core';
import type { Server } from 'socket.io';
import { GameSnapshotUseCase } from '../application/game-snapshot.use-case.js';
import type { ClaimResult } from '../application/claim.use-case.js';
import type { DeckCard } from '../domain/ports/deck.repository.js';

/**
 * Le contrôleur HTTP exécute la commande, le diffuseur prévient la salle. Cette
 * séparation est la décision D7 : les commandes méritent un code de retour, le
 * WebSocket ne sert qu à diffuser.
 */
@Injectable()
export class LotoBroadcaster {
  private server: Server | null = null;

  // Jeton explicite, cf. loto.gateway.ts : sans lui, la métadata de type que
  // Nest utiliserait pour deviner GameSnapshotUseCase n existe pas sous le
  // transform esbuild de Vitest, et cette dépendance resterait à undefined.
  constructor(@Inject(GameSnapshotUseCase) private readonly snapshot: GameSnapshotUseCase) {}

  attach(server: Server): void {
    this.server = server;
  }

  private room(gameId: string): string {
    return rooms.session('loto', gameId);
  }

  async gameChanged(gameId: string): Promise<void> {
    const snapshot = await this.snapshot.execute({ gameId });
    this.server?.to(this.room(gameId)).emit('game-changed', snapshot.game);
  }

  async teamJoined(gameId: string, teamId: string): Promise<void> {
    const snapshot = await this.snapshot.execute({ gameId });
    const team = snapshot.teams.find((candidate) => candidate.id === teamId);
    if (team === undefined) return;
    this.server?.to(this.room(gameId)).emit('team-joined', team);
  }

  async cardDrawn(gameId: string, order: number, card: DeckCard): Promise<void> {
    this.server?.to(this.room(gameId)).emit('card-drawn', {
      order,
      cardId: card.id,
      label: card.label,
      imageId: card.imageId,
    });
  }

  markChanged(
    gameId: string,
    teamId: string,
    payload: { cardId: string; marked: boolean; byGuestId: string },
  ): void {
    this.server?.to(rooms.subgroup('loto', gameId, teamId)).emit('mark-changed', payload);
  }

  claimResult(gameId: string, teamId: string, result: ClaimResult): void {
    this.server?.to(this.room(gameId)).emit('claim-result', {
      teamId,
      valid: result.valid,
      atDraw: result.atDraw,
      blockedUntilDraw: result.blockedUntilDraw,
    });
  }

  async gameFinished(gameId: string, wonByTeamId: string | null): Promise<void> {
    const snapshot = await this.snapshot.execute({ gameId });
    this.server?.to(this.room(gameId)).emit('game-finished', {
      wonByTeamId,
      pattern: snapshot.game.pattern,
      drawCount: snapshot.game.lastDrawOrder,
    });
  }
}
