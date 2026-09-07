export const NO_PENALTY = 0;

/**
 * Rang de tirage à partir duquel une équipe peut réclamer de nouveau.
 * La pénalité se compte en tours et non en secondes : le tirage est manuel,
 * il n existe aucune horloge partagée entre l animatrice et les téléphones.
 */
export function blockUntil(currentDrawOrder: number, penaltyDraws: number): number {
  if (penaltyDraws <= 0) return NO_PENALTY;
  return currentDrawOrder + penaltyDraws;
}

export function isBlocked(blockedUntilDraw: number, currentDrawOrder: number): boolean {
  if (blockedUntilDraw === NO_PENALTY) return false;
  return currentDrawOrder < blockedUntilDraw;
}
