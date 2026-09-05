import { DomainError } from '@quetzal/core/errors';

export class DeckTooSmallError extends DomainError {
  constructor(size: number) {
    super(`Un jeu de cartes doit contenir au moins 16 cartes, celui-ci en a ${size}`);
  }
}

export class InvalidGameTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`Transition de partie interdite : ${from} vers ${to}`);
  }
}

export class TeamBlockedError extends DomainError {
  constructor(untilDraw: number) {
    super(`Équipe bloquée jusqu'au tirage ${untilDraw}`);
  }
}

export class GameNotRunningError extends DomainError {
  constructor(status: string) {
    super(`Action impossible : la partie est à l'état ${status}`);
  }
}

export class InvalidTeamLimitError extends DomainError {
  constructor(maxTeams: number) {
    super(`Une partie doit accepter au moins une équipe, celle-ci en accepte ${maxTeams}`);
  }
}

export class TablaGenerationExhaustedError extends DomainError {
  constructor(existingTablaCount: number, attempts: number) {
    super(
      `Impossible de générer une tabla unique après ${attempts} tentatives ` +
        `(${existingTablaCount} tabla(s) déjà distribuée(s) dans cette partie)`,
    );
  }
}

export class DeckNotFoundError extends DomainError {
  constructor(deckId: string) {
    super(`Jeu de cartes introuvable : ${deckId}`);
  }
}

export class GameNotFoundError extends DomainError {
  constructor(gameId: string) {
    super(`Partie introuvable : ${gameId}`);
  }
}

export class JoinCodeUnavailableError extends DomainError {
  constructor(attempts: number) {
    super(`Aucun code d entrée libre trouvé en ${attempts} tentatives`);
  }
}

export class NoCardsLeftError extends DomainError {
  constructor(gameId: string) {
    super(`Toutes les cartes ont été tirées dans la partie ${gameId}`);
  }
}

export class DeckLockedError extends DomainError {
  constructor(deckId: string) {
    super(`Jeu de cartes ${deckId} verrouillé : une partie en cours l utilise`);
  }
}

export class CardNotOnTablaError extends DomainError {
  constructor(cardId: string) {
    super(`Carte ${cardId} absente de la tabla de l équipe`);
  }
}

export class TeamNotFoundError extends DomainError {
  constructor(teamId: string) {
    super(`Équipe introuvable : ${teamId}`);
  }
}

export class TeamIndexCollisionError extends DomainError {
  constructor(gameId: string, teamIndex: number) {
    super(`Une équipe existe déjà à l index ${teamIndex} de la partie ${gameId}`);
  }
}
