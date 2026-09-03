import { InvalidGameTransitionError } from './errors.js';

export const GAME_STATUSES = ['draft', 'open', 'running', 'finished'] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

const ALLOWED: Record<GameStatus, readonly GameStatus[]> = {
  draft: ['open'],
  // open vers finished : l animatrice referme une partie que personne n a jouée.
  open: ['running', 'finished'],
  running: ['finished'],
  finished: [],
};

export function canTransition(from: GameStatus, to: GameStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: GameStatus, to: GameStatus): void {
  if (!canTransition(from, to)) throw new InvalidGameTransitionError(from, to);
}

/** On rejoint avant le premier tirage, comme on entre en classe avant le cours. */
export function canJoin(status: GameStatus): boolean {
  return status === 'open';
}

/** Le premier tirage fait passer la partie de open à running. */
export function canDraw(status: GameStatus): boolean {
  return status === 'open' || status === 'running';
}

export function canClaim(status: GameStatus): boolean {
  return status === 'running';
}
