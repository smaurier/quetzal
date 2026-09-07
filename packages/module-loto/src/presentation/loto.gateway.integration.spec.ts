import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Namespace, Server as IoServer, ServerOptions, Socket as ServerSocket } from 'socket.io';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { LotoGateway } from './loto.gateway.js';
import { LotoBroadcaster } from './loto.broadcaster.js';
import { ClaimUseCase } from '../application/claim.use-case.js';
import { GameSnapshotUseCase, type GameSnapshot } from '../application/game-snapshot.use-case.js';
import { JoinGameUseCase } from '../application/join-game.use-case.js';
import { ToggleMarkUseCase } from '../application/toggle-mark.use-case.js';
import { FakeGameRepository, RecordingEventBus } from '../application/testing/fake-repositories.js';

const GUEST_TOKEN = 'jeton-invité-valide';
const GUEST_TOKEN_2 = 'jeton-invité-coéquipier';
const USER_TOKEN = 'jeton-utilisateur-valide';

/**
 * Reproduit, en miniature et localement au test, ce que fait l adaptateur de la
 * plateforme (apps/api/src/ws/quetzal-io.adapter.ts) : poser l identité sur
 * client.data au handshake, avant que le gateway n en dépende. Le module ne peut
 * pas importer apps/api (frontière §3), donc ce faux vit ici plutôt que le vrai.
 */
class FakeHandshakeAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly gameId: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: Partial<ServerOptions>): IoServer {
    return super.createIOServer(port, options) as IoServer;
  }

  override bindClientConnect(server: Namespace, callback: (socket: ServerSocket) => void): void {
    server.use((socket, next) => {
      const auth = (socket.handshake.auth ?? {}) as { token?: string; guestToken?: string };
      if (auth.guestToken === GUEST_TOKEN) {
        socket.data = {
          role: 'guest',
          guestId: 'guest-1',
          displayName: 'Ana',
          tenantId: 't1',
          sessionId: this.gameId,
        };
        next();
        return;
      }
      if (auth.guestToken === GUEST_TOKEN_2) {
        socket.data = {
          role: 'guest',
          guestId: 'guest-2',
          displayName: 'Beto',
          tenantId: 't1',
          sessionId: this.gameId,
        };
        next();
        return;
      }
      if (auth.token === USER_TOKEN) {
        socket.data = { role: 'owner', userId: 'user-1', tenantId: 't1' };
        next();
        return;
      }
      next(new Error('identité de test inconnue'));
    });
    super.bindClientConnect(server, callback);
  }
}

// Contrat temps réel de la passerelle, sur un vrai serveur socket.io, avec les
// cas d usage adossés aux dépôts factices : on teste le transport, pas la
// persistance (déjà couverte par les 178 tests unitaires + 17 d intégration).
describe('LotoGateway (intégration)', () => {
  let app: INestApplication;
  let url: string;
  let gameId: string;

  beforeAll(async () => {
    const games = new FakeGameRepository();
    const game = await games.create({
      deckId: 'deck-1',
      createdBy: 'u-1',
      joinCode: 'AAA222',
      // maxTeams: 1 pour que deux invités distincts partagent la même équipe et
      // sa même tabla — condition nécessaire au test de diffusion d équipe.
      settings: { pattern: 'linea', falseClaimPenaltyDraws: 3, maxTeams: 1 },
    });
    await games.freezeCards(
      game.id,
      Array.from({ length: 16 }, (_, i) => ({ rank: i + 1, label: `Carta ${i + 1}`, imageId: null })),
    );
    await games.setStatus(game.id, 'open');
    gameId = game.id;

    const eventBus = new RecordingEventBus();

    const moduleRef = await Test.createTestingModule({
      providers: [
        LotoGateway,
        LotoBroadcaster,
        { provide: JoinGameUseCase, useFactory: () => new JoinGameUseCase(games, Math.random) },
        { provide: ToggleMarkUseCase, useFactory: () => new ToggleMarkUseCase(games) },
        { provide: ClaimUseCase, useFactory: () => new ClaimUseCase(games, eventBus) },
        { provide: GameSnapshotUseCase, useFactory: () => new GameSnapshotUseCase(games) },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new FakeHandshakeAdapter(app, gameId));
    await app.listen(0);
    const port = (app.getHttpServer().address() as { port: number }).port;
    url = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  function connect(auth: Record<string, unknown>, query: Record<string, string> = {}): ClientSocket {
    return io(`${url}/ws/loto`, { transports: ['websocket'], auth, query, forceNew: true });
  }

  it('émet state à la connexion, sans qu on ait à le demander', async () => {
    const socket = connect({ guestToken: GUEST_TOKEN });
    const state = await new Promise<GameSnapshot>((resolve) => socket.once('state', resolve));
    expect(state).toHaveProperty('game');
    expect(state).toHaveProperty('tabla');
    expect(state.tabla?.cards.length).toBe(16);
    socket.close();
  });

  it('répond à mark par un événement mark-changed, jamais par un accusé', async () => {
    const socket = connect({ guestToken: GUEST_TOKEN });
    const state = await new Promise<GameSnapshot>((resolve) => socket.once('state', resolve));
    const cardId = state.tabla?.cards[0]?.id;
    expect(cardId).toBeDefined();

    const changed = new Promise((resolve) => socket.once('mark-changed', resolve));
    let ackCalled = false;
    socket.emit('mark', { cardId, marked: true }, () => {
      ackCalled = true;
    });

    expect(await changed).toMatchObject({ cardId, marked: true });
    expect(ackCalled).toBe(false);
    socket.close();
  });

  it('diffuse mark-changed à toute l équipe, pas seulement à qui a marqué', async () => {
    // maxTeams: 1 place ces deux invités dans la même équipe (spec §5, D3). Un
    // gateway qui répondrait via un simple retour {event, data} — le piège du
    // 03/09 — ne le renverrait qu à l émetteur : ce test l aurait vu échouer.
    // Les deux entrées sont SÉQUENTIELLES à dessein. Les mener de front rendait
    // ce test intermittent, et pour une raison qui n est pas de sa faute :
    // JoinGameUseCase lit les équipes, décide, puis crée. Deux entrées
    // concurrentes lisent la même liste vide et créent chacune une équipe au
    // même teamIndex. Ce défaut est réel et tracé dans la dette du plan ; ce
    // test-ci vérifie la diffusion à l équipe, pas la concurrence.
    const author = connect({ guestToken: GUEST_TOKEN });
    const authorState = await new Promise<GameSnapshot>((resolve) => author.once('state', resolve));
    const teammate = connect({ guestToken: GUEST_TOKEN_2 });
    await new Promise<GameSnapshot>((resolve) => teammate.once('state', resolve));
    const cardId = authorState.tabla?.cards[0]?.id;
    expect(cardId).toBeDefined();

    const teammateSaw = new Promise((resolve) => teammate.once('mark-changed', resolve));
    author.emit('mark', { cardId, marked: true });

    expect(await teammateSaw).toMatchObject({ cardId, marked: true, byGuestId: 'guest-1' });
    author.close();
    teammate.close();
  });

  it('coupe une connexion sans identifiant de partie', async () => {
    const socket = connect({ token: USER_TOKEN });
    await new Promise((resolve) => socket.once('disconnect', resolve));
    expect(socket.connected).toBe(false);
  });
});
