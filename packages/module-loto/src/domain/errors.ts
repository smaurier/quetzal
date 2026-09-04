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
