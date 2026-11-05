import { Injectable } from '@nestjs/common';
import { newId } from '@quetzal/db';
import { getTenantScopedPrisma } from '@quetzal/core';
import { isGameStatus, type GameStatus } from '../domain/game-status.js';
import type { PatternKey } from '../domain/pattern.js';
import { PatternIndexOutOfRangeError, TeamIndexCollisionError, UnknownGameStatusError } from '../domain/errors.js';
import {
  estIndexDansLaListe,
  patternAt,
  patternCouranteOuNull,
  patternsDeLaLigne,
  serializePatternList,
} from '../domain/pattern-list.js';
import type { DeckCard, NewDeckCard } from '../domain/ports/deck.repository.js';
import type {
  GameRepository,
  GameSettings,
  GameState,
  GameSummary,
  TeamState,
} from '../domain/ports/game.repository.js';

interface GameRow {
  id: string;
  deckId: string;
  status: string;
  // Obsolete : conservee le temps d un deploiement (issue #52). Figee a la
  // creation sur la PREMIERE figure de `patterns` : `advancePattern` ne la
  // met jamais a jour. Compatible avec l ancienne instance seulement avant
  // toute avance ; un retour arriere apres avance lirait la mauvaise figure,
  // et ce n est pas couvert (cf. create()).
  pattern: string;
  patterns: string | null;
  patternIndex: number;
  falseClaimPenaltyDraws: number;
  maxTeams: number;
  guestLocale: string | null;
  joinCode: string;
  createdAt: Date;
  wonByTeamId: string | null;
}

interface TeamRow {
  id: string;
  teamIndex: number;
  cardIds: unknown;
  markedCardIds: unknown;
  blockedUntilDraw: number;
}

interface PrismaWithLoto {
  loto_Game: {
    create(args: { data: Record<string, unknown> }): Promise<GameRow>;
    findFirst(args: { where: Record<string, unknown> }): Promise<GameRow | null>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
    findMany(args: { orderBy: Record<string, unknown> }): Promise<GameRow[]>;
  };
  loto_GameCard: {
    createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }>;
    findMany(args: { where: Record<string, unknown>; orderBy: Record<string, unknown> }): Promise<DeckCard[]>;
  };
  loto_Team: {
    create(args: { data: Record<string, unknown> }): Promise<TeamRow>;
    findMany(args: { where: Record<string, unknown>; orderBy: Record<string, unknown> }): Promise<TeamRow[]>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  loto_Member: {
    findFirst(args: { where: Record<string, unknown> }): Promise<{ teamId: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: Record<string, unknown>;
    }): Promise<{ teamId: string; displayName: string }[]>;
  };
  loto_Draw: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(args: { where: Record<string, unknown>; orderBy: Record<string, unknown> }): Promise<{ cardId: string; order: number }[]>;
  };
  loto_Claim: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
}

/** Un tableau JSON relu de Postgres arrive en `unknown`. Aucun `as` sans garde. */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** Code d erreur Prisma pour une violation de contrainte d unicité. */
function isUniqueConstraintViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

@Injectable()
export class PrismaGameRepository implements GameRepository {
  private get prisma(): PrismaWithLoto {
    return getTenantScopedPrisma() as unknown as PrismaWithLoto;
  }

  private toState(row: GameRow, lastDrawOrder: number): GameState {
    if (!isGameStatus(row.status)) {
      throw new UnknownGameStatusError(row.status);
    }
    const patterns = patternsDeLaLigne(row.patterns, row.pattern);
    if (!estIndexDansLaListe(patterns, row.patternIndex)) {
      // Une ligne desynchronisee, comme un statut inconnu : `toState` ne rend
      // qu une seule partie et l appelant doit savoir qu elle est cassee.
      // `list()` ne leve pas pour autant (cf. patternCouranteOuNull) : cette
      // asymetrie est voulue, le tableau de bord ne doit pas tomber en entier
      // pour une seule ligne corrompue.
      throw new PatternIndexOutOfRangeError(row.patternIndex, patterns.length);
    }
    return {
      id: row.id,
      deckId: row.deckId,
      status: row.status,
      joinCode: row.joinCode,
      settings: {
        patterns,
        falseClaimPenaltyDraws: row.falseClaimPenaltyDraws,
        maxTeams: row.maxTeams,
        guestLocale: row.guestLocale,
      },
      lastDrawOrder,
      patternIndex: row.patternIndex,
      wonByTeamId: row.wonByTeamId,
    };
  }

  private toTeam(row: TeamRow, memberDisplayNames: string[]): TeamState {
    return {
      id: row.id,
      teamIndex: row.teamIndex,
      memberDisplayNames,
      cardIds: toStringArray(row.cardIds),
      markedCardIds: toStringArray(row.markedCardIds),
      blockedUntilDraw: row.blockedUntilDraw,
    };
  }

  private async lastDrawOrder(gameId: string): Promise<number> {
    const draws = await this.prisma.loto_Draw.findMany({
      where: { gameId },
      orderBy: { order: 'desc' },
    });
    return draws[0]?.order ?? 0;
  }

  async create(input: {
    deckId: string;
    createdBy: string;
    joinCode: string;
    settings: GameSettings;
  }): Promise<GameState> {
    const row = await this.prisma.loto_Game.create({
      data: {
        id: newId(),
        deckId: input.deckId,
        createdBy: input.createdBy,
        joinCode: input.joinCode,
        status: 'draft',
        patterns: serializePatternList(input.settings.patterns),
        // Issue #52 : l ancienne instance lit encore cette colonne pendant
        // la bascule, et ne connait que la figure a la creation. Cette
        // compatibilite descendante couvre la bascule AVANT une avance :
        // elle ne couvre PAS un retour a l ancienne instance apres qu une
        // partie a plusieurs figures a avance (`advancePattern` ne touche
        // jamais cette colonne). Decision deliberee, pas un oubli : un tel
        // rollback n est pas dans le perimetre du motif expand / contract.
        pattern: patternAt(input.settings.patterns, 0),
        falseClaimPenaltyDraws: input.settings.falseClaimPenaltyDraws,
        maxTeams: input.settings.maxTeams,
        guestLocale: input.settings.guestLocale,
      },
    });
    return this.toState(row, 0);
  }

  async findById(gameId: string): Promise<GameState | null> {
    const row = await this.prisma.loto_Game.findFirst({ where: { id: gameId } });
    if (row === null) return null;
    return this.toState(row, await this.lastDrawOrder(gameId));
  }

  async findByJoinCode(joinCode: string): Promise<GameState | null> {
    const row = await this.prisma.loto_Game.findFirst({ where: { joinCode } });
    if (row === null) return null;
    return this.toState(row, await this.lastDrawOrder(row.id));
  }

  async list(): Promise<GameSummary[]> {
    const rows = await this.prisma.loto_Game.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.flatMap((row) => {
      const courante = patternCouranteOuNull(row.patterns, row.pattern, row.patternIndex);
      if (!isGameStatus(row.status) || courante === null) return [];
      return [
        {
          id: row.id,
          deckId: row.deckId,
          status: row.status,
          pattern: courante,
          joinCode: row.joinCode,
          createdAt: row.createdAt,
          wonByTeamId: row.wonByTeamId,
        },
      ];
    });
  }

  async setStatus(gameId: string, status: GameStatus, patch?: { wonByTeamId?: string }): Promise<void> {
    const data: Record<string, unknown> = { status };
    if (status === 'running') data['startedAt'] = new Date();
    if (status === 'finished') data['finishedAt'] = new Date();
    if (patch?.wonByTeamId !== undefined) data['wonByTeamId'] = patch.wonByTeamId;
    await this.prisma.loto_Game.updateMany({ where: { id: gameId }, data });
  }

  async freezeCards(gameId: string, cards: NewDeckCard[]): Promise<void> {
    if (cards.length === 0) return;
    await this.prisma.loto_GameCard.createMany({
      data: cards.map((card) => ({
        id: newId(),
        gameId,
        rank: card.rank,
        label: card.label,
        imageId: card.imageId,
      })),
    });
  }

  async frozenCards(gameId: string): Promise<DeckCard[]> {
    return this.prisma.loto_GameCard.findMany({ where: { gameId }, orderBy: { rank: 'asc' } });
  }

  async teams(gameId: string): Promise<TeamState[]> {
    const rows = await this.prisma.loto_Team.findMany({
      where: { gameId },
      orderBy: { teamIndex: 'asc' },
    });
    const members = await this.prisma.loto_Member.findMany({
      where: { gameId },
      orderBy: { joinedAt: 'asc' },
    });
    const byTeam = new Map<string, string[]>();
    for (const member of members) {
      const names = byTeam.get(member.teamId) ?? [];
      names.push(member.displayName);
      byTeam.set(member.teamId, names);
    }
    return rows.map((row) => this.toTeam(row, byTeam.get(row.id) ?? []));
  }

  async createTeam(gameId: string, input: { teamIndex: number; cardIds: string[] }): Promise<TeamState> {
    try {
      const row = await this.prisma.loto_Team.create({
        data: {
          id: newId(),
          gameId,
          teamIndex: input.teamIndex,
          cardIds: input.cardIds,
          markedCardIds: [],
        },
      });
      return this.toTeam(row, []);
    } catch (err) {
      // P2002 sur [gameId, teamIndex, tenantId] : deux entrées concurrentes ont
      // visé le même index. Signal distinct pour que JoinGameUseCase relise et
      // rejoue l affectation plutôt que d échouer sur une vraie panne (spec
      // tâche 34, étape 4 ter). Toute autre erreur remonte telle quelle.
      if (isUniqueConstraintViolation(err)) throw new TeamIndexCollisionError(gameId, input.teamIndex);
      throw err;
    }
  }

  async setMarks(teamId: string, markedCardIds: string[]): Promise<void> {
    await this.prisma.loto_Team.updateMany({ where: { id: teamId }, data: { markedCardIds } });
  }

  async blockTeam(teamId: string, untilDraw: number): Promise<void> {
    await this.prisma.loto_Team.updateMany({ where: { id: teamId }, data: { blockedUntilDraw: untilDraw } });
  }

  async findMember(gameId: string, guestId: string): Promise<{ teamId: string } | null> {
    return this.prisma.loto_Member.findFirst({ where: { gameId, guestId } });
  }

  async addMember(input: {
    gameId: string;
    teamId: string;
    guestId: string;
    displayName: string;
  }): Promise<void> {
    await this.prisma.loto_Member.create({ data: { id: newId(), ...input } });
  }

  async appendDraw(gameId: string, order: number, cardId: string): Promise<boolean> {
    try {
      await this.prisma.loto_Draw.create({ data: { id: newId(), gameId, order, cardId } });
      return true;
    } catch (err) {
      // P2002 : violation d unicité. Les deux contraintes de Loto_Draw rendent
      // un double appui simultané sans effet plutôt qu erroné (spec 6.1).
      // Toute autre erreur est une vraie panne et doit remonter.
      if (isUniqueConstraintViolation(err)) return false;
      throw err;
    }
  }

  async drawnCards(gameId: string): Promise<string[]> {
    const rows = await this.prisma.loto_Draw.findMany({ where: { gameId }, orderBy: { order: 'asc' } });
    return rows.map((row) => row.cardId);
  }

  async recordClaim(input: {
    gameId: string;
    teamId: string;
    atDraw: number;
    valid: boolean;
    pattern: PatternKey;
  }): Promise<void> {
    await this.prisma.loto_Claim.create({ data: { id: newId(), ...input } });
  }

  async advancePattern(gameId: string, depuisIndex: number): Promise<boolean> {
    // La condition est dans le WHERE : c est Postgres qui arbitre la course,
    // pas nous. `updateMany` rend le nombre de lignes touchées.
    const result = await this.prisma.loto_Game.updateMany({
      where: { id: gameId, patternIndex: depuisIndex },
      data: { patternIndex: depuisIndex + 1 },
    });
    return result.count === 1;
  }

  async hasValidClaimAt(gameId: string, atDraw: number): Promise<boolean> {
    return (await this.prisma.loto_Claim.count({ where: { gameId, atDraw, valid: true } })) > 0;
  }

  async setWinner(gameId: string, teamId: string): Promise<void> {
    await this.prisma.loto_Game.updateMany({ where: { id: gameId }, data: { wonByTeamId: teamId } });
  }
}
