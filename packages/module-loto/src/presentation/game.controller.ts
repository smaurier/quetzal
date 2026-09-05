import { Body, Controller, Get, Inject, Param, Post, BadRequestException } from '@nestjs/common';
import { getCurrentTenant } from '@quetzal/core';
import { CreateGameUseCase } from '../application/create-game.use-case.js';
import { DrawCardUseCase } from '../application/draw-card.use-case.js';
import { FinishGameUseCase } from '../application/finish-game.use-case.js';
import { GameSnapshotUseCase } from '../application/game-snapshot.use-case.js';
import { ListGamesUseCase } from '../application/list-games.use-case.js';
import { OpenGameUseCase } from '../application/open-game.use-case.js';
import { LotoBroadcaster } from './loto.broadcaster.js';
import { createGameSchema } from './dto/loto.dto.js';

@Controller('api/modules/loto/games')
export class GameController {
  // Jetons explicites, cf. loto.gateway.ts : sans eux, la métadata de type que
  // Nest utiliserait pour deviner ces use-cases n existe pas sous le transform
  // esbuild de Vitest, et ces dépendances resteraient à undefined.
  constructor(
    @Inject(CreateGameUseCase) private readonly createGame: CreateGameUseCase,
    @Inject(OpenGameUseCase) private readonly openGame: OpenGameUseCase,
    @Inject(DrawCardUseCase) private readonly drawCard: DrawCardUseCase,
    @Inject(FinishGameUseCase) private readonly finishGame: FinishGameUseCase,
    @Inject(GameSnapshotUseCase) private readonly snapshot: GameSnapshotUseCase,
    @Inject(ListGamesUseCase) private readonly listGames: ListGamesUseCase,
    @Inject(LotoBroadcaster) private readonly broadcaster: LotoBroadcaster,
  ) {}

  // Avant `:id` : sinon Nest lit `games` comme un identifiant de partie.
  @Get()
  async list() {
    return { games: await this.listGames.execute() };
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createGameSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { userId } = getCurrentTenant();
    if (userId === undefined || userId === null) throw new BadRequestException('Utilisateur requis');

    return this.createGame.execute({
      deckId: parsed.data.deckId,
      createdBy: userId,
      settings: {
        pattern: parsed.data.pattern,
        maxTeams: parsed.data.maxTeams,
        falseClaimPenaltyDraws: parsed.data.falseClaimPenaltyDraws,
      },
    });
  }

  @Get(':id')
  async read(@Param('id') id: string) {
    return this.snapshot.execute({ gameId: id });
  }

  @Post(':id/open')
  async open(@Param('id') id: string) {
    const game = await this.openGame.execute({ gameId: id });
    await this.broadcaster.gameChanged(id);
    return game;
  }

  @Post(':id/draw')
  async draw(@Param('id') id: string) {
    const result = await this.drawCard.execute({ gameId: id });
    if (result.drawn) {
      // Le premier tirage fait basculer la partie de `open` à `running`. Sans
      // cette diffusion, l écran du joueur reste sur `open`, son bouton de
      // réclamation ne s active jamais et la partie devient ingagnable depuis
      // un téléphone — alors que tout, côté serveur, se déroule normalement.
      if (result.order === 1) await this.broadcaster.gameChanged(id);
      await this.broadcaster.cardDrawn(id, result.order, result.card);
    }
    return result;
  }

  @Post(':id/finish')
  async finish(@Param('id') id: string) {
    const game = await this.finishGame.execute({ gameId: id });
    await this.broadcaster.gameFinished(id, null);
    return game;
  }
}
