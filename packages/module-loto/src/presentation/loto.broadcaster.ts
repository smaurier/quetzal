import { Inject, Injectable } from '@nestjs/common';
import { logger, rooms } from '@quetzal/core';
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

  /**
   * Le seul point d emission, et il n est plus muet (issue #34). Le `?.`
   * d avant avalait l emission sans rien dire quand le serveur manquait.
   * On ne jette pas pour autant : la commande HTTP est deja executee et
   * persistee quand la diffusion part, donc echouer ici rendrait un 500 sur
   * une operation reussie. Une trace, pas une panne.
   */
  private emit(room: string, event: string, payload: unknown): void {
    if (this.server === null) {
      logger.error({ module: 'loto', action: 'broadcast.detached', event, room },
        'loto: diffusion demandee avant attachement du serveur');
      return;
    }
    this.server.to(room).emit(event, payload);
  }

  private room(gameId: string): string {
    return rooms.session('loto', gameId);
  }

  async gameChanged(gameId: string): Promise<void> {
    const snapshot = await this.snapshot.execute({ gameId });
    this.emit(this.room(gameId), 'game-changed', snapshot.game);
  }

  async teamJoined(gameId: string, teamId: string): Promise<void> {
    const snapshot = await this.snapshot.execute({ gameId });
    const team = snapshot.teams.find((candidate) => candidate.id === teamId);
    if (team === undefined) return;
    this.emit(this.room(gameId), 'team-joined', team);
  }

  /**
   * Issue #29. Un evenement DISTINCT de `team-joined`, et pas par gout de la
   * symetrie : le client traite `team-joined` par un filtre puis un ajout en
   * fin de liste, ce qui deplace l equipe. Acceptable a l arrivee d une equipe,
   * pas a un renommage — la liste projetee au tableau se reorganiserait sous
   * les yeux de la classe.
   */
  async teamRenamed(gameId: string, teamId: string): Promise<void> {
    const snapshot = await this.snapshot.execute({ gameId });
    const team = snapshot.teams.find((candidate) => candidate.id === teamId);
    if (team === undefined) return;
    this.emit(this.room(gameId), 'team-renamed', team);
  }

  async cardDrawn(gameId: string, order: number, card: DeckCard): Promise<void> {
    this.emit(this.room(gameId), 'card-drawn', {
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
    this.emit(rooms.subgroup('loto', gameId, teamId), 'mark-changed', payload);
  }

  claimResult(gameId: string, teamId: string, result: ClaimResult): void {
    this.emit(this.room(gameId), 'claim-result', {
      teamId,
      valid: result.valid,
      atDraw: result.atDraw,
      blockedUntilDraw: result.blockedUntilDraw,
    });
  }

  async gameFinished(gameId: string, wonByTeamId: string | null): Promise<void> {
    const snapshot = await this.snapshot.execute({ gameId });
    this.emit(this.room(gameId), 'game-finished', {
      wonByTeamId,
      pattern: snapshot.game.pattern,
      drawCount: snapshot.game.lastDrawOrder,
    });
  }

  async patternChanged(gameId: string): Promise<void> {
    const snapshot = await this.snapshot.execute({ gameId });
    this.server?.to(this.room(gameId)).emit('pattern-changed', {
      pattern: snapshot.game.pattern,
      position: snapshot.game.patternPosition,
      total: snapshot.game.patternTotal,
    });
  }
}
