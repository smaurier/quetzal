import { describe, it, expect } from 'vitest';
import type { Server } from 'socket.io';
import { LotoBroadcaster } from './loto.broadcaster.js';
import { LotoGateway } from './loto.gateway.js';
import type { GameSnapshotUseCase } from '../application/game-snapshot.use-case.js';
import type { ClaimUseCase } from '../application/claim.use-case.js';
import type { JoinGameUseCase } from '../application/join-game.use-case.js';
import type { ToggleMarkUseCase } from '../application/toggle-mark.use-case.js';

/** Un serveur socket.io reduit a ce que le diffuseur en utilise : `to(room).emit()`. */
function fakeServer() {
  const emis: { room: string; event: string; payload: unknown }[] = [];
  const server = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emis.push({ room, event, payload });
      },
    }),
  };
  return { emis, server: server as unknown as Server };
}

/** Le diffuseur n a besoin du snapshot que pour trois de ses six messages ;
 *  `cardDrawn` n y touche pas, c est donc par lui qu on observe l emission. */
const sansSnapshot = null as unknown as GameSnapshotUseCase;

const carte = { id: 'card-1', rank: 1, label: 'El Gallo', imageId: null };

describe('LotoBroadcaster', () => {
  it('diffuse dans la salle de la partie une fois le serveur attache', async () => {
    const { emis, server } = fakeServer();
    const diffuseur = new LotoBroadcaster(sansSnapshot);
    diffuseur.attach(server);

    await diffuseur.cardDrawn('game-7', 3, carte);

    expect(emis).toHaveLength(1);
    expect(emis[0]?.room).toBe('loto:session:game-7');
    expect(emis[0]?.event).toBe('card-drawn');
  });

  // Issue #34 : tant que le serveur n est pas attache, `this.server?.` avale
  // l emission sans rien dire. On garde le comportement non bloquant (une
  // commande HTTP deja executee ne doit pas rendre 500 parce que la diffusion
  // a rate) mais il ne doit plus etre muet : voir le log d erreur dans emit().
  it('n emet rien et ne jette pas quand le serveur n est pas attache', async () => {
    const diffuseur = new LotoBroadcaster(sansSnapshot);

    await expect(diffuseur.cardDrawn('game-7', 3, carte)).resolves.toBeUndefined();
  });
});

describe('LotoGateway', () => {
  // Issue #34, le coeur du defaut : `attach()` etait appele depuis
  // `handleConnection`, donc tout ce qui etait diffuse AVANT la premiere
  // connexion partait dans le vide. L ouverture d une partie
  // (`POST /:id/open`) diffuse `game-changed` alors que personne n est encore
  // connecte. Sans consequence aujourd hui, il n y a aucun auditeur a cet
  // instant, mais c est un silence qui masquera un vrai defaut le jour ou l
  // ordre changera. `afterInit` tombe a l initialisation du module, avant
  // toute connexion : c est la que le serveur doit arriver.
  it('attache le serveur des l initialisation, sans attendre une connexion', async () => {
    const { emis, server } = fakeServer();
    const diffuseur = new LotoBroadcaster(sansSnapshot);
    const passerelle = new LotoGateway(
      null as unknown as JoinGameUseCase,
      null as unknown as ToggleMarkUseCase,
      null as unknown as ClaimUseCase,
      sansSnapshot,
      diffuseur,
    );

    passerelle.afterInit(server);

    // Aucun handleConnection n a eu lieu, et la diffusion part quand meme.
    await diffuseur.cardDrawn('game-7', 1, carte);
    expect(emis).toHaveLength(1);
  });
});
