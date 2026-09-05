export interface LotoGameStartedEvent {
  gameId: string;
  tenantId: string;
  deckId: string;
  pattern: string;
  teamCount: number;
}

export interface LotoCardDrawnEvent {
  gameId: string;
  tenantId: string;
  order: number;
  cardId: string;
  label: string;
}

export interface LotoClaimRejectedEvent {
  gameId: string;
  tenantId: string;
  teamId: string;
  atDraw: number;
  blockedUntilDraw: number;
}

export interface LotoGameFinishedEvent {
  gameId: string;
  tenantId: string;
  wonByTeamId: string | null;
  pattern: string;
  drawCount: number;
}

export const LotoGameStartedEvent = 'LotoGameStartedEvent' as const;
export const LotoCardDrawnEvent = 'LotoCardDrawnEvent' as const;
export const LotoClaimRejectedEvent = 'LotoClaimRejectedEvent' as const;
export const LotoGameFinishedEvent = 'LotoGameFinishedEvent' as const;
