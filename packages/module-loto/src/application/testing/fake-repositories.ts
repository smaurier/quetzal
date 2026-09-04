import type {
  Deck,
  DeckCard,
  DeckRepository,
  DeckSummary,
  NewDeckCard,
} from '../../domain/ports/deck.repository.js';
import type {
  GameRepository,
  GameSettings,
  GameState,
  TeamState,
} from '../../domain/ports/game.repository.js';
import type { GameStatus } from '../../domain/game-status.js';

let counter = 0;
const nextId = (prefix: string): string => `${prefix}-${++counter}`;

export function deckOf(cardCount: number, overrides: Partial<Deck> = {}): Deck {
  const cards: DeckCard[] = Array.from({ length: cardCount }, (_, i) => ({
    id: `card-${i + 1}`,
    rank: i + 1,
    label: `Carta ${i + 1}`,
    imageId: null,
  }));
  return {
    id: 'deck-1',
    name: 'Jeu de test',
    isTemplate: false,
    cardCount,
    cards,
    ...overrides,
  };
}

export class FakeDeckRepository implements DeckRepository {
  readonly decks = new Map<string, Deck>();
  readonly unfinished = new Set<string>();

  add(deck: Deck): Deck {
    this.decks.set(deck.id, deck);
    return deck;
  }

  async list(): Promise<DeckSummary[]> {
    return [...this.decks.values()].map(({ id, name, isTemplate, cardCount }) => ({
      id,
      name,
      isTemplate,
      cardCount,
    }));
  }

  async findById(deckId: string): Promise<Deck | null> {
    return this.decks.get(deckId) ?? null;
  }

  async create(input: {
    name: string;
    isTemplate: boolean;
    createdBy: string;
    cards: NewDeckCard[];
  }): Promise<Deck> {
    const deck: Deck = {
      id: nextId('deck'),
      name: input.name,
      isTemplate: input.isTemplate,
      cardCount: input.cards.length,
      cards: input.cards.map((card, i) => ({ id: nextId('card'), ...card, rank: card.rank || i + 1 })),
    };
    this.decks.set(deck.id, deck);
    return deck;
  }

  async rename(deckId: string, name: string): Promise<void> {
    const deck = this.decks.get(deckId);
    if (deck !== undefined) this.decks.set(deckId, { ...deck, name });
  }

  async updateCard(
    deckId: string,
    rank: number,
    patch: { label?: string; imageId?: string | null },
  ): Promise<void> {
    const deck = this.decks.get(deckId);
    if (deck === undefined) return;
    this.decks.set(deckId, {
      ...deck,
      cards: deck.cards.map((card) => (card.rank === rank ? { ...card, ...patch } : card)),
    });
  }

  async delete(deckId: string): Promise<void> {
    this.decks.delete(deckId);
  }

  async hasUnfinishedGame(deckId: string): Promise<boolean> {
    return this.unfinished.has(deckId);
  }
}

export class FakeGameRepository implements GameRepository {
  readonly games = new Map<string, GameState>();
  readonly frozen = new Map<string, DeckCard[]>();
  readonly teamsByGame = new Map<string, TeamState[]>();
  readonly members = new Map<string, { gameId: string; teamId: string; displayName: string }>();
  readonly draws = new Map<string, { order: number; cardId: string }[]>();
  readonly claims: { gameId: string; teamId: string; atDraw: number; valid: boolean }[] = [];

  async create(input: {
    deckId: string;
    createdBy: string;
    joinCode: string;
    settings: GameSettings;
  }): Promise<GameState> {
    const game: GameState = {
      id: nextId('game'),
      deckId: input.deckId,
      status: 'draft',
      joinCode: input.joinCode,
      settings: input.settings,
      lastDrawOrder: 0,
      wonByTeamId: null,
    };
    this.games.set(game.id, game);
    return game;
  }

  async findById(gameId: string): Promise<GameState | null> {
    const game = this.games.get(gameId);
    if (game === undefined) return null;
    return { ...game, lastDrawOrder: (this.draws.get(gameId) ?? []).length };
  }

  async findByJoinCode(joinCode: string): Promise<GameState | null> {
    for (const game of this.games.values()) {
      if (game.joinCode === joinCode) return game;
    }
    return null;
  }

  async setStatus(gameId: string, status: GameStatus, patch?: { wonByTeamId?: string }): Promise<void> {
    const game = this.games.get(gameId);
    if (game === undefined) return;
    this.games.set(gameId, {
      ...game,
      status,
      wonByTeamId: patch?.wonByTeamId ?? game.wonByTeamId,
    });
  }

  async freezeCards(gameId: string, cards: NewDeckCard[]): Promise<void> {
    this.frozen.set(
      gameId,
      cards.map((card, i) => ({ id: `frozen-${i + 1}`, ...card })),
    );
  }

  async frozenCards(gameId: string): Promise<DeckCard[]> {
    return this.frozen.get(gameId) ?? [];
  }

  async teams(gameId: string): Promise<TeamState[]> {
    return [...(this.teamsByGame.get(gameId) ?? [])].sort((a, b) => a.teamIndex - b.teamIndex);
  }

  async createTeam(gameId: string, input: { teamIndex: number; cardIds: string[] }): Promise<TeamState> {
    const team: TeamState = {
      id: nextId('team'),
      teamIndex: input.teamIndex,
      memberDisplayNames: [],
      cardIds: input.cardIds,
      markedCardIds: [],
      blockedUntilDraw: 0,
    };
    this.teamsByGame.set(gameId, [...(this.teamsByGame.get(gameId) ?? []), team]);
    return team;
  }

  private patchTeam(teamId: string, patch: Partial<TeamState>): void {
    for (const [gameId, teams] of this.teamsByGame) {
      this.teamsByGame.set(
        gameId,
        teams.map((team) => (team.id === teamId ? { ...team, ...patch } : team)),
      );
    }
  }

  async setMarks(teamId: string, markedCardIds: string[]): Promise<void> {
    this.patchTeam(teamId, { markedCardIds });
  }

  async blockTeam(teamId: string, untilDraw: number): Promise<void> {
    this.patchTeam(teamId, { blockedUntilDraw: untilDraw });
  }

  async findMember(gameId: string, guestId: string): Promise<{ teamId: string } | null> {
    const member = this.members.get(`${gameId}:${guestId}`);
    return member === undefined ? null : { teamId: member.teamId };
  }

  async addMember(input: {
    gameId: string;
    teamId: string;
    guestId: string;
    displayName: string;
  }): Promise<void> {
    this.members.set(`${input.gameId}:${input.guestId}`, {
      gameId: input.gameId,
      teamId: input.teamId,
      displayName: input.displayName,
    });
    for (const [gameId, teams] of this.teamsByGame) {
      this.teamsByGame.set(
        gameId,
        teams.map((team) =>
          team.id === input.teamId
            ? { ...team, memberDisplayNames: [...team.memberDisplayNames, input.displayName] }
            : team,
        ),
      );
    }
  }

  async appendDraw(gameId: string, order: number, cardId: string): Promise<boolean> {
    const existing = this.draws.get(gameId) ?? [];
    if (existing.some((draw) => draw.order === order || draw.cardId === cardId)) return false;
    this.draws.set(gameId, [...existing, { order, cardId }]);
    return true;
  }

  async drawnCards(gameId: string): Promise<string[]> {
    return (this.draws.get(gameId) ?? []).map((draw) => draw.cardId);
  }

  async recordClaim(input: {
    gameId: string;
    teamId: string;
    atDraw: number;
    valid: boolean;
  }): Promise<void> {
    this.claims.push(input);
  }
}

export class RecordingEventBus {
  readonly emitted: { name: string; payload: unknown }[] = [];

  async emit<T = unknown>(name: string, payload: T): Promise<void> {
    this.emitted.push({ name, payload });
  }

  on(): void {
    // Aucun abonné dans les tests de cas d usage.
  }

  names(): string[] {
    return this.emitted.map((event) => event.name);
  }
}
