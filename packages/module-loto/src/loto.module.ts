import { Module } from '@nestjs/common';
import { eventBus } from '@quetzal/core';
import { ClaimUseCase } from './application/claim.use-case.js';
import { CreateGameUseCase } from './application/create-game.use-case.js';
import { DrawCardUseCase } from './application/draw-card.use-case.js';
import { FinishGameUseCase } from './application/finish-game.use-case.js';
import { GameSnapshotUseCase } from './application/game-snapshot.use-case.js';
import { JoinGameUseCase } from './application/join-game.use-case.js';
import { ListGamesUseCase } from './application/list-games.use-case.js';
import { ManageDecksUseCase } from './application/manage-decks.use-case.js';
import { OpenGameUseCase } from './application/open-game.use-case.js';
import { ToggleMarkUseCase } from './application/toggle-mark.use-case.js';
import type { DeckRepository } from './domain/ports/deck.repository.js';
import type { GameRepository } from './domain/ports/game.repository.js';
import { PrismaCardImageStore } from './infrastructure/prisma-card-image.store.js';
import { PrismaDeckRepository } from './infrastructure/prisma-deck.repository.js';
import { PrismaGameRepository } from './infrastructure/prisma-game.repository.js';
import { DeckController } from './presentation/deck.controller.js';
import { GameController } from './presentation/game.controller.js';
import { ImageController } from './presentation/image.controller.js';
import { LotoBroadcaster } from './presentation/loto.broadcaster.js';
import { LotoGateway } from './presentation/loto.gateway.js';

const DECKS = 'LotoDeckRepository';
const GAMES = 'LotoGameRepository';
const IMAGES = 'LotoCardImageStore';

@Module({
  controllers: [DeckController, GameController, ImageController],
  providers: [
    LotoGateway,
    LotoBroadcaster,
    { provide: DECKS, useClass: PrismaDeckRepository },
    { provide: GAMES, useClass: PrismaGameRepository },
    { provide: IMAGES, useClass: PrismaCardImageStore },
    {
      provide: ManageDecksUseCase,
      useFactory: (decks: DeckRepository) => new ManageDecksUseCase(decks),
      inject: [DECKS],
    },
    {
      provide: CreateGameUseCase,
      useFactory: (decks: DeckRepository, games: GameRepository) =>
        new CreateGameUseCase(decks, games, eventBus, Math.random),
      inject: [DECKS, GAMES],
    },
    {
      provide: OpenGameUseCase,
      useFactory: (decks: DeckRepository, games: GameRepository) =>
        new OpenGameUseCase(decks, games, eventBus),
      inject: [DECKS, GAMES],
    },
    {
      provide: JoinGameUseCase,
      useFactory: (games: GameRepository) => new JoinGameUseCase(games, Math.random),
      inject: [GAMES],
    },
    {
      provide: DrawCardUseCase,
      useFactory: (games: GameRepository) => new DrawCardUseCase(games, eventBus, Math.random),
      inject: [GAMES],
    },
    {
      provide: ToggleMarkUseCase,
      useFactory: (games: GameRepository) => new ToggleMarkUseCase(games),
      inject: [GAMES],
    },
    {
      provide: ClaimUseCase,
      useFactory: (games: GameRepository) => new ClaimUseCase(games, eventBus),
      inject: [GAMES],
    },
    {
      provide: FinishGameUseCase,
      useFactory: (games: GameRepository) => new FinishGameUseCase(games, eventBus),
      inject: [GAMES],
    },
    {
      provide: GameSnapshotUseCase,
      useFactory: (games: GameRepository) => new GameSnapshotUseCase(games),
      inject: [GAMES],
    },
    {
      provide: ListGamesUseCase,
      useFactory: (games: GameRepository, decks: DeckRepository) => new ListGamesUseCase(games, decks),
      inject: [GAMES, DECKS],
    },
  ],
})
export class LotoModule {}
