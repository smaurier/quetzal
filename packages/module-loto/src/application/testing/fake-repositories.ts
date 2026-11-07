import type {
  Deck,
  DeckCard,
  DeckRepository,
  DeckSummary,
  NewDeckCard,
} from '../../domain/ports/deck.repository.js';
import type { CardImageStore, StoredImage } from '../../domain/ports/card-image.store.js';
import type {
  GameRepository,
  GameSettings,
  GameState,
  GameSummary,
  TeamState,
} from '../../domain/ports/game.repository.js';
import type { GameStatus } from '../../domain/game-status.js';
import { TeamIndexCollisionError } from '../../domain/errors.js';
import { patternAt } from '../../domain/pattern-list.js';
import type { PatternKey } from '../../domain/pattern.js';

let counter = 0;
// `-gen-` distingue les ids générés des ids de convention posés par les
// fixtures (deckOf() rend toujours 'deck-1', 'card-1'…) : sans ce préfixe, le
// tout premier id généré dans un fichier de test collisionne avec eux.
const nextId = (prefix: string): string => `${prefix}-gen-${++counter}`;

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
    const deck = this.decks.get(deckId);
    if (deck === undefined) return null;
    // Le dépôt Prisma trie par rang. Un faux qui rend l ordre d insertion
    // ferait passer des tests que la vraie implémentation ferait échouer.
    return { ...deck, cards: [...deck.cards].sort((a, b) => a.rank - b.rank) };
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

  async addCard(deckId: string, card: NewDeckCard): Promise<DeckCard> {
    const deck = this.decks.get(deckId);
    if (deck === undefined) throw new Error(`jeu absent du faux depot : ${deckId}`);
    const inseree: DeckCard = { id: nextId('card'), ...card };
    const cards = [...deck.cards, inseree];
    this.decks.set(deckId, { ...deck, cards, cardCount: cards.length });
    return inseree;
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
  readonly createdAt = new Map<string, Date>();
  readonly frozen = new Map<string, DeckCard[]>();
  readonly teamsByGame = new Map<string, TeamState[]>();
  readonly members = new Map<string, { gameId: string; teamId: string; displayName: string }>();
  readonly draws = new Map<string, { order: number; cardId: string }[]>();
  readonly claims: {
    gameId: string;
    teamId: string;
    atDraw: number;
    valid: boolean;
    pattern: PatternKey;
  }[] = [];

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
      patternIndex: 0,
      wonByTeamId: null,
    };
    this.games.set(game.id, game);
    // Compteur plutôt que `new Date()` : plusieurs parties créées dans la même
    // milliseconde doivent quand même se départager pour retrouver « la plus
    // récente d abord », ce que la précision de Date.now() ne garantit pas.
    this.createdAt.set(game.id, new Date(counter));
    return game;
  }

  async findById(gameId: string): Promise<GameState | null> {
    const game = this.games.get(gameId);
    if (game === undefined) return null;
    // Le rang du dernier tirage, pas leur nombre. Les deux coïncident tant que
    // les rangs se suivent sans trou, ce que rien n impose au port.
    const orders = (this.draws.get(gameId) ?? []).map((draw) => draw.order);
    return { ...game, lastDrawOrder: orders.length === 0 ? 0 : Math.max(...orders) };
  }

  async findByJoinCode(joinCode: string): Promise<GameState | null> {
    for (const game of this.games.values()) {
      if (game.joinCode === joinCode) return game;
    }
    return null;
  }

  async list(): Promise<GameSummary[]> {
    return [...this.games.values()]
      .sort((a, b) => (this.createdAt.get(b.id)?.getTime() ?? 0) - (this.createdAt.get(a.id)?.getTime() ?? 0))
      .map((game) => ({
        id: game.id,
        deckId: game.deckId,
        status: game.status,
        pattern: patternAt(game.settings.patterns, game.patternIndex),
        joinCode: game.joinCode,
        createdAt: this.createdAt.get(game.id) ?? new Date(0),
        wonByTeamId: game.wonByTeamId,
      }));
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

  /**
   * Reproduit la contrainte d unicité `[gameId, teamIndex, tenantId]` : c est
   * le seul moyen fidèle de rendre en mémoire ce que deux entrées concurrentes
   * provoquent en base. Contrairement à `failNextAppendDraw`, aucune armature
   * manuelle n est nécessaire — deux `execute()` lancés de front interleavent
   * réellement leurs lectures avant écriture (cf. join-game.use-case.spec.ts),
   * donc la collision se produit d elle-même dès que le second appel arrive ici.
   */
  async createTeam(gameId: string, input: { teamIndex: number; cardIds: string[] }): Promise<TeamState> {
    const existing = this.teamsByGame.get(gameId) ?? [];
    if (existing.some((team) => team.teamIndex === input.teamIndex)) {
      throw new TeamIndexCollisionError(gameId, input.teamIndex);
    }
    const team: TeamState = {
      id: nextId('team'),
      teamIndex: input.teamIndex,
      chosenName: null,
      memberDisplayNames: [],
      cardIds: input.cardIds,
      markedCardIds: [],
      blockedUntilDraw: 0,
    };
    this.teamsByGame.set(gameId, [...existing, team]);
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

  async renameTeam(teamId: string, name: string | null): Promise<void> {
    for (const [gameId, teams] of this.teamsByGame) {
      if (!teams.some((team) => team.id === teamId)) continue;
      this.teamsByGame.set(
        gameId,
        teams.map((team) => (team.id === teamId ? { ...team, chosenName: name } : team)),
      );
      return;
    }
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

  /**
   * Arme un échec d insertion pour le prochain tirage. C est la seule façon de
   * reproduire en mémoire une course entre deux appuis simultanés : en base,
   * c est une contrainte d unicité qui tranche, et le perdant reçoit false.
   */
  failNextAppendDraw = false;

  async appendDraw(gameId: string, order: number, cardId: string): Promise<boolean> {
    if (this.failNextAppendDraw) {
      this.failNextAppendDraw = false;
      return false;
    }
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
    pattern: PatternKey;
  }): Promise<void> {
    this.claims.push(input);
  }

  /**
   * Arme un échec pour le prochain advancePattern. Même modèle que
   * failNextAppendDraw : c est la seule façon de reproduire en mémoire une
   * course perdue sur le compare-and-set, sans rien modifier à l état.
   */
  failNextAdvancePattern = false;

  async advancePattern(gameId: string, depuisIndex: number): Promise<boolean> {
    if (this.failNextAdvancePattern) {
      this.failNextAdvancePattern = false;
      return false;
    }
    const game = this.games.get(gameId);
    if (game === undefined || game.patternIndex !== depuisIndex) return false;
    this.games.set(gameId, { ...game, patternIndex: depuisIndex + 1 });
    return true;
  }

  async setWinner(gameId: string, teamId: string): Promise<void> {
    const game = this.games.get(gameId);
    if (game !== undefined) this.games.set(gameId, { ...game, wonByTeamId: teamId });
  }

  async hasValidClaimAt(gameId: string, atDraw: number): Promise<boolean> {
    return this.claims.some(
      (claim) => claim.gameId === gameId && claim.atDraw === atDraw && claim.valid,
    );
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

/**
 * Issue #27 : un faux store d images qui ne sait qu une chose, mais c est
 * celle qui compte au niveau du cas d usage — a-t-on demande le ramassage, et
 * combien de fois. Ce que le ramassage choisit de garder est une question
 * d infrastructure, et elle se prouve contre un vrai Postgres.
 */
export class FakeCardImageStore implements CardImageStore {
  readonly stored = new Map<string, StoredImage>();
  ramassages = 0;

  async put(input: { mimeType: string; bytes: Uint8Array }): Promise<StoredImage> {
    const contentHash = `hash-${input.bytes.length}`;
    const existante = this.stored.get(contentHash);
    if (existante !== undefined) return existante;
    const image: StoredImage = { id: nextId('image'), contentHash, ...input };
    this.stored.set(contentHash, image);
    return image;
  }

  async findByHash(contentHash: string): Promise<StoredImage | null> {
    return this.stored.get(contentHash) ?? null;
  }

  async deleteOrphans(): Promise<number> {
    this.ramassages += 1;
    return 0;
  }
}
