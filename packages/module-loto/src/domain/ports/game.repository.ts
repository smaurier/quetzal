import type { GameStatus } from '../game-status.js';
import type { PatternKey } from '../pattern.js';
import type { DeckCard, NewDeckCard } from './deck.repository.js';

export interface GameSettings {
  /**
   * Les figures à enchaîner, dans l ordre voulu par l animatrice. De une à
   * quatre, sans doublon. Une liste à une entrée est le cas de toutes les
   * parties créées avant cette fonctionnalité.
   */
  patterns: PatternKey[];
  falseClaimPenaltyDraws: number;
  maxTeams: number;
  /**
   * Langue imposée à tous les écrans invités, résolue UNE FOIS à la création
   * depuis celle de l'animatrice. `null` quand l'option est décochée : chaque
   * appareil garde alors la sienne. Jamais relue en direct — sinon une
   * animatrice changeant sa langue ferait basculer toute la classe.
   */
  guestLocale: string | null;
}

export interface GameState {
  id: string;
  deckId: string;
  status: GameStatus;
  joinCode: string;
  settings: GameSettings;
  /** Rang du dernier tirage. Zéro quand rien n a encore été tiré. */
  lastDrawOrder: number;
  /** Où en est la partie dans sa liste de figures. Zéro à la création. */
  patternIndex: number;
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

export interface GameSummary {
  id: string;
  deckId: string;
  status: GameStatus;
  pattern: PatternKey;
  joinCode: string;
  createdAt: Date;
  wonByTeamId: string | null;
}

export interface GameRepository {
  create(input: { deckId: string; createdBy: string; joinCode: string; settings: GameSettings }): Promise<GameState>;
  findById(gameId: string): Promise<GameState | null>;
  findByJoinCode(joinCode: string): Promise<GameState | null>;
  setStatus(gameId: string, status: GameStatus, patch?: { wonByTeamId?: string }): Promise<void>;

  /** Historique du locataire, la plus récente d abord. */
  list(): Promise<GameSummary[]>;

  /** Décision D5 : la partie copie les cartes dont elle a besoin au lancement. */
  freezeCards(gameId: string, cards: NewDeckCard[]): Promise<void>;
  frozenCards(gameId: string): Promise<DeckCard[]>;

  /** Triées par teamIndex croissant, pour que la répartition soit déterministe. */
  teams(gameId: string): Promise<TeamState[]>;
  /**
   * Lève TeamIndexCollisionError si une équipe existe déjà à ce teamIndex
   * pour cette partie — signal distinct d une vraie panne, posé sur la
   * contrainte d unicité `[gameId, teamIndex, tenantId]`. À charge de
   * l appelant (JoinGameUseCase) de relire les équipes et de rejouer
   * l affectation : deux entrées concurrentes lisent la même liste avant que
   * l une ou l autre n ait créé sa ligne, et visent donc le même index.
   */
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

  recordClaim(input: {
    gameId: string;
    teamId: string;
    atDraw: number;
    valid: boolean;
    pattern: PatternKey;
  }): Promise<void>;

  /**
   * Avance d une figure, et seulement si l index vaut encore `depuisIndex`.
   * Rend `false` quand quelqu un a avancé entre-temps.
   *
   * ⭐ Compare-and-set et NON incrémentation : deux téléphones réclamant au
   * même tirage lisent tous deux le même index, sont tous deux valides, et
   * appelleraient tous deux cette méthode. Un `++` ferait sauter une figure.
   * La condition vit dans le `WHERE`, donc Postgres arbitre, pas nous.
   */
  advancePattern(gameId: string, depuisIndex: number): Promise<boolean>;

  /**
   * Vrai si une réclamation valide est déjà enregistrée à ce tirage. Sert le
   * garde-fou D5 : au tirage où une figure vient d être gagnée, une
   * réclamation ratée ne bloque personne : elle avait raison une seconde trop
   * tard, et la punir mécaniquement serait injuste.
   */
  hasValidClaimAt(gameId: string, atDraw: number): Promise<boolean>;

  /**
   * Écrit la gagnante sans toucher au statut. `setStatus` ne peut pas servir
   * ici : `ALLOWED.running` vaut `['finished']`, donc la transition
   * `running → running` est refusée, et à raison : le statut ne change pas,
   * il n a donc rien à faire dans ce geste.
   */
  setWinner(gameId: string, teamId: string): Promise<void>;
}
