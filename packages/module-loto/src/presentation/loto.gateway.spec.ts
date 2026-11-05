import { describe, it, expect, vi } from 'vitest';
import type { Socket } from 'socket.io';
import { LotoGateway } from './loto.gateway.js';
import type { LotoBroadcaster } from './loto.broadcaster.js';
import type { ClaimResult, ClaimUseCase } from '../application/claim.use-case.js';
import type { JoinGameUseCase } from '../application/join-game.use-case.js';
import type { ToggleMarkUseCase } from '../application/toggle-mark.use-case.js';
import type { GameSnapshotUseCase } from '../application/game-snapshot.use-case.js';

function resultat(outcome: ClaimResult['outcome']): ClaimResult {
  return { valid: outcome !== 'rejected', atDraw: 3, blockedUntilDraw: 0, outcome };
}

// Doublure minimale de ClaimUseCase : seule execute() compte pour handleClaim.
// Cast en deux temps plutot qu as any (§8), meme procede que
// claim.use-case.spec.ts pour RecordingEventBus en EventBus.
class StubClaimUseCase {
  constructor(private readonly result: ClaimResult) {}

  async execute(): Promise<ClaimResult> {
    return this.result;
  }
}

// Doublure minimale de LotoBroadcaster : seuls claimResult() et gameFinished()
// comptent pour handleClaim, et sont les deux seuls enregistres ici.
class RecordingBroadcaster {
  readonly claimResultCalls: { gameId: string; teamId: string; result: ClaimResult }[] = [];
  readonly gameFinishedCalls: { gameId: string; wonByTeamId: string }[] = [];

  claimResult(gameId: string, teamId: string, result: ClaimResult): void {
    this.claimResultCalls.push({ gameId, teamId, result });
  }

  async gameFinished(gameId: string, wonByTeamId: string): Promise<void> {
    this.gameFinishedCalls.push({ gameId, wonByTeamId });
  }
}

/**
 * Construit la passerelle a la main, sans Nest. Le commentaire du
 * constructeur signale un piege avec design:paramtypes, mais il ne vise que
 * l injection automatique de Nest : ici les cinq dependances sont passees par
 * position, donc il ne joue aucun role.
 */
function buildGateway(result: ClaimResult) {
  const claim = new StubClaimUseCase(result);
  const broadcaster = new RecordingBroadcaster();
  const gateway = new LotoGateway(
    {} as unknown as JoinGameUseCase,
    {} as unknown as ToggleMarkUseCase,
    claim as unknown as ClaimUseCase,
    {} as unknown as GameSnapshotUseCase,
    broadcaster as unknown as LotoBroadcaster,
  );
  return { gateway, claim, broadcaster };
}

function clientWith(data: { gameId?: string; teamId?: string }): Socket {
  return { data } as unknown as Socket;
}

describe('LotoGateway, handleClaim', () => {
  it('diffuse gameFinished quand outcome vaut game-finished', async () => {
    const { gateway, broadcaster } = buildGateway(resultat('game-finished'));

    await gateway.handleClaim(clientWith({ gameId: 'g1', teamId: 't1' }));

    expect(broadcaster.gameFinishedCalls).toHaveLength(1);
    expect(broadcaster.claimResultCalls).toEqual([
      { gameId: 'g1', teamId: 't1', result: resultat('game-finished') },
    ]);
  });

  // Le test qui attrape le defaut : une figure intermediaire gagnee ne doit
  // jamais annoncer la fin de la partie a tous les ecrans.
  it('ne diffuse pas gameFinished quand outcome vaut pattern-won', async () => {
    const { gateway, broadcaster } = buildGateway(resultat('pattern-won'));

    await gateway.handleClaim(clientWith({ gameId: 'g1', teamId: 't1' }));

    expect(broadcaster.gameFinishedCalls).toHaveLength(0);
    expect(broadcaster.claimResultCalls).toHaveLength(1);
  });

  it('ne diffuse pas gameFinished quand outcome vaut pattern-won-by-other', async () => {
    const { gateway, broadcaster } = buildGateway(resultat('pattern-won-by-other'));

    await gateway.handleClaim(clientWith({ gameId: 'g1', teamId: 't1' }));

    expect(broadcaster.gameFinishedCalls).toHaveLength(0);
    expect(broadcaster.claimResultCalls).toHaveLength(1);
  });

  it('ne diffuse pas gameFinished quand outcome vaut rejected', async () => {
    const { gateway, broadcaster } = buildGateway(resultat('rejected'));

    await gateway.handleClaim(clientWith({ gameId: 'g1', teamId: 't1' }));

    expect(broadcaster.gameFinishedCalls).toHaveLength(0);
    expect(broadcaster.claimResultCalls).toHaveLength(1);
  });

  it('ne fait rien sans gameId ni teamId sur le socket', async () => {
    const { gateway, claim, broadcaster } = buildGateway(resultat('game-finished'));
    const executeSpy = vi.spyOn(claim, 'execute');

    await gateway.handleClaim(clientWith({}));

    expect(executeSpy).not.toHaveBeenCalled();
    expect(broadcaster.claimResultCalls).toHaveLength(0);
    expect(broadcaster.gameFinishedCalls).toHaveLength(0);
  });
});
