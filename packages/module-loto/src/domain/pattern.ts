export const PATTERN_KEYS = ['linea', 'esquinas', 'centro', 'llena'] as const;
export type PatternKey = (typeof PATTERN_KEYS)[number];

/** Grille d'une tabla, seize cases lues ligne par ligne. */
export type Grid = readonly boolean[];

export const TABLA_ROWS = 4;
export const TABLA_COLS = 4;
export const TABLA_SIZE = TABLA_ROWS * TABLA_COLS;

const ROWS = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 11],
  [12, 13, 14, 15],
];
const COLS = [
  [0, 4, 8, 12],
  [1, 5, 9, 13],
  [2, 6, 10, 14],
  [3, 7, 11, 15],
];
const DIAGONALS = [
  [0, 5, 10, 15],
  [3, 6, 9, 12],
];
const CORNERS = [0, 3, 12, 15];
const CENTER = [5, 6, 9, 10];
const ALL = Array.from({ length: TABLA_SIZE }, (_, i) => i);

function allMarked(grid: Grid, cells: readonly number[]): boolean {
  return cells.every((i) => grid[i] === true);
}

const PREDICATES: Record<PatternKey, (grid: Grid) => boolean> = {
  linea: (grid) => [...ROWS, ...COLS, ...DIAGONALS].some((line) => allMarked(grid, line)),
  esquinas: (grid) => allMarked(grid, CORNERS),
  centro: (grid) => allMarked(grid, CENTER),
  llena: (grid) => allMarked(grid, ALL),
};

export function matchesPattern(grid: Grid, pattern: PatternKey): boolean {
  return PREDICATES[pattern](grid);
}
