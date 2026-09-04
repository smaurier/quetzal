import type { GameStatus } from '../game-status.js';
import type { PatternKey } from '../pattern.js';
import type { DeckCard, NewDeckCard } from './deck.repository.js';

export interface GameSettings {
  pattern: PatternKey;
  falseClaimPenaltyDraws: number;
  maxTeams: number;
}

export interface GameState {
  id: string;
  deckId: string;
  status: GameStatus;
  joinCode: string;
  settings: GameSettings;
  /** Rang du dernier tirage. Zéro quand rien n a encore été tiré. */
  lastDrawOrder: number;
  wonByTeamId: string | null;
}

export interface TeamState {
  id: string;
  /**
   * Rang de création, à partir de zéro. Le nom de l équipe n est pas stocké :
   * il se dérive de teamIndex et des membres via `teamNameFor` (spec 6.1). Une
   * équipe d un porte le nom de son membre, au-delà elle porte son numéro — en
   * stockant le nom, ce passage de un à deux membres deviendrait une transition
   * à gérer, et un libellé traduit finirait en base.
   */
  teamIndex: number;
  memberDisplayNames: string[];
  cardIds: string[];
  /**
   * Décision D2 : état partagé, sans autorité. Ce tableau ne participe JAMAIS à
   * une décision de jeu. Il est voisin de cardIds et de même type : c est le
   * point exact où une inattention rouvrirait la triche fermée par D1. La seule
   * protection structurelle est le brand DrawnCardId, qui rend
   * `drawnCardIds(team.markedCardIds)` compilable mais absurde à lire, et
   * `ClaimInput.drawnCardIds = new Set(team.markedCardIds)` impossible à compiler.
   */
  markedCardIds: string[];
  blockedUntilDraw: number;
}

export interface GameRepository {
  create(input: { deckId: string; createdBy: string; joinCode: string; settings: GameSettings }): Promise<GameState>;
  findById(gameId: string): Promise<GameState | null>;
  findByJoinCode(joinCode: string): Promise<GameState | null>;
  setStatus(gameId: string, status: GameStatus, patch?: { wonByTeamId?: string }): Promise<void>;

  /** Décision D5 : la partie copie les cartes dont elle a besoin au lancement. */
  freezeCards(gameId: string, cards: NewDeckCard[]): Promise<void>;
  frozenCards(gameId: string): Promise<DeckCard[]>;

  /** Triées par teamIndex croissant, pour que la répartition soit déterministe. */
  teams(gameId: string): Promise<TeamState[]>;
  createTeam(gameId: string, input: { teamIndex: number; cardIds: string[] }): Promise<TeamState>;
  setMarks(teamId: string, markedCardIds: string[]): Promise<void>;
  blockTeam(teamId: string, untilDraw: number): Promise<void>;

  findMember(gameId: string, guestId: string): Promise<{ teamId: string } | null>;
  addMember(input: { gameId: string; teamId: string; guestId: string; displayName: string }): Promise<void>;

  /**
   * Insère le tirage suivant. Rend faux si le rang ou la carte existe déjà,
   * ce qui rend un double appui sans effet plutôt qu erroné.
   */
  appendDraw(gameId: string, order: number, cardId: string): Promise<boolean>;
  /**
   * Registre des tirages du serveur, source de vérité de toute réclamation.
   * Nommé `drawnCards` et non `drawnCardIds` : ce dernier nom appartient à la
   * fabrique brandée du domaine (`domain/drawn-cards.ts`), et deux symboles
   * homonymes dont l un seul porte la garantie de provenance seraient un piège.
   */
  drawnCards(gameId: string): Promise<string[]>;

  recordClaim(input: { gameId: string; teamId: string; atDraw: number; valid: boolean }): Promise<void>;
}
