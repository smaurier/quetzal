import { Injectable } from '@nestjs/common';
import type { EventBus } from '@quetzal/core';
import { GameNotFoundError, GameNotRunningError, NoCardsLeftError } from '../domain/errors.js';
import { canDraw } from '../domain/game-status.js';
import type { DeckCard } from '../domain/ports/deck.repository.js';
import type { GameRepository, GameState } from '../domain/ports/game.repository.js';

export type DrawResult = { drawn: false } | { drawn: true; order: number; card: DeckCard };

@Injectable()
export class DrawCardUseCase {
  constructor(
    private readonly games: GameRepository,
    private readonly eventBus: EventBus,
    private readonly random: () => number,
  ) {}

  async execute(input: { gameId: string }): Promise<DrawResult> {
    const found = await this.games.findById(input.gameId);
    if (found === null) throw new GameNotFoundError(input.gameId);
    if (!canDraw(found.status)) throw new GameNotRunningError(found.status);

    const drawnBefore = await this.games.drawnCards(found.id);
    const game = await this.reconcile(found, drawnBefore.length);

    const frozen = await this.games.frozenCards(game.id);
    const alreadyDrawn = new Set(drawnBefore);
    const remaining = frozen.filter((card) => !alreadyDrawn.has(card.id));
    if (remaining.length === 0) throw new NoCardsLeftError(game.id);

    const index = Math.floor(this.random() * remaining.length) % remaining.length;
    const card = remaining[index]!;
    const order = game.lastDrawOrder + 1;

    const inserted = await this.games.appendDraw(game.id, order, card.id);
    if (!inserted) return { drawn: false };

    await this.start(game, drawnBefore.length);

    await this.eventBus.emit('loto.card.drawn', {
      gameId: game.id,
      order,
      cardId: card.id,
      label: card.label,
    });
    return { drawn: true, order, card };
  }

  /**
   * Répare une partie restée en `open` alors que des cartes sont déjà sorties.
   * Le port n offre pas de transaction : un incident entre l insertion du
   * tirage et la bascule laisserait une partie ingagnable, puisque canClaim
   * exige `running`. Cette réconciliation referme cette fenêtre.
   */
  private async reconcile(game: GameState, drawCount: number): Promise<GameState> {
    if (game.status !== 'open' || drawCount === 0) return game;
    await this.startFrom(game);
    const reloaded = await this.games.findById(game.id);
    if (reloaded === null) throw new GameNotFoundError(game.id);
    return reloaded;
  }

  private async start(game: GameState, drawCountBefore: number): Promise<void> {
    if (game.status !== 'open' || drawCountBefore > 0) return;
    await this.startFrom(game);
  }

  private async startFrom(game: GameState): Promise<void> {
    await this.games.setStatus(game.id, 'running');
    const teams = await this.games.teams(game.id);
    await this.eventBus.emit('loto.game.started', {
      gameId: game.id,
      deckId: game.deckId,
      pattern: game.settings.pattern,
      teamCount: teams.length,
    });
  }
}
