import { Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { rooms, logger } from '@quetzal/core';
import type { Server, Socket } from 'socket.io';
import { ClaimUseCase } from '../application/claim.use-case.js';
import { GameSnapshotUseCase } from '../application/game-snapshot.use-case.js';
import { JoinGameUseCase } from '../application/join-game.use-case.js';
import { ToggleMarkUseCase } from '../application/toggle-mark.use-case.js';
import { LotoBroadcaster } from './loto.broadcaster.js';

interface SocketData {
  role?: string;
  guestId?: string;
  displayName?: string;
  sessionId?: string;
  userId?: string;
  tenantId?: string;
  teamId?: string;
  gameId?: string;
}

// CORS et authentification du handshake appartiennent à l adaptateur de la
// plateforme, jamais au module.
@WebSocketGateway({ namespace: 'ws/loto' })
export class LotoGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  // Jetons explicites plutôt qu inférence par type : le transform esbuild de
  // Vitest n émet pas la métadata design:paramtypes que Nest utiliserait sinon,
  // ce qui a laissé les cinq dépendances à undefined en intégration (piège
  // trouvé à l écriture de loto.gateway.integration.spec.ts).
  constructor(
    @Inject(JoinGameUseCase) private readonly join: JoinGameUseCase,
    @Inject(ToggleMarkUseCase) private readonly toggleMark: ToggleMarkUseCase,
    @Inject(ClaimUseCase) private readonly claim: ClaimUseCase,
    @Inject(GameSnapshotUseCase) private readonly snapshot: GameSnapshotUseCase,
    @Inject(LotoBroadcaster) private readonly broadcaster: LotoBroadcaster,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    this.broadcaster.attach(this.server);
    const data = client.data as SocketData;

    // Un invité tient son identifiant de partie de son jeton : il ne peut pas
    // en viser une autre. Une animatrice le passe en query, et le cloisonnement
    // par locataire fait le reste — une partie d un autre locataire est
    // introuvable, donc la connexion échoue proprement.
    const gameId =
      data.role === 'guest' ? data.sessionId : queryValue(client.handshake.query['gameId']);
    if (gameId === undefined) {
      client.disconnect(true);
      return;
    }
    data.gameId = gameId;

    try {
      if (data.role === 'guest' && data.guestId !== undefined) {
        const result = await this.join.execute({
          gameId,
          guestId: data.guestId,
          displayName: data.displayName ?? 'Invité',
        });
        data.teamId = result.teamId;
        await client.join(rooms.subgroup('loto', gameId, result.teamId));
      }

      await client.join(rooms.session('loto', gameId));

      const snapshot = await this.snapshot.execute(
        data.teamId === undefined ? { gameId } : { gameId, teamId: data.teamId },
      );
      client.emit('state', snapshot);

      if (data.teamId !== undefined) await this.broadcaster.teamJoined(gameId, data.teamId);
    } catch (err) {
      logger.warn({ err, gameId }, 'loto: connexion refusée');
      client.emit('join-failed', { reason: (err as Error).name });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('mark')
  async handleMark(
    @MessageBody() body: { cardId: string; marked: boolean },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const data = client.data as SocketData;
    if (data.gameId === undefined || data.teamId === undefined) return;

    const result = await this.toggleMark.execute({
      gameId: data.gameId,
      teamId: data.teamId,
      cardId: body.cardId,
      marked: body.marked,
    });

    // Diffusé, jamais retourné : Nest transformerait un retour {event, data} en
    // événement et non en accusé de réception. Le client écoute mark-changed.
    this.broadcaster.markChanged(data.gameId, data.teamId, {
      cardId: result.cardId,
      marked: result.marked,
      byGuestId: data.guestId ?? '',
    });
  }

  @SubscribeMessage('claim')
  async handleClaim(@ConnectedSocket() client: Socket): Promise<void> {
    const data = client.data as SocketData;
    if (data.gameId === undefined || data.teamId === undefined) return;

    const result = await this.claim.execute({ gameId: data.gameId, teamId: data.teamId });
    this.broadcaster.claimResult(data.gameId, data.teamId, result);
    if (result.valid) await this.broadcaster.gameFinished(data.gameId, data.teamId);
  }
}

function queryValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}
