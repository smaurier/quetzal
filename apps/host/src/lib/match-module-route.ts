export interface MatchableRoute {
  readonly path: string;
}

export interface MatchedRoute<R extends MatchableRoute> {
  readonly route: R;
  readonly params: Readonly<Record<string, string>>;
}

function segmentsOf(path: string): readonly string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

// Matches a requested path against a manifest's uiRoutes, supporting `:param` segments.
// Rules:
// - segment count must match exactly: `games/:gameId` matches neither `games` alone
//   (too few) nor `games/abc/extra` (too many) — no partial or prefix matching.
// - a `:param` segment captures whatever the requested path has in that position.
// - when several routes match the same requested path, the one with the most literal
//   (non-`:param`) segments wins — a literal beats a param at the same position, so
//   `games/new` is preferred over `games/:gameId` for the request `games/new`.
// - ties in specificity keep the first-declared route.
// - no match returns null: the caller must handle it explicitly, never guess (that
//   silent guess — falling back to uiRoutes[0] — is the bug this replaces).
export function matchModuleRoute<R extends MatchableRoute>(
  routes: readonly R[],
  requestedPath: string,
): MatchedRoute<R> | null {
  const requested = segmentsOf(requestedPath);
  let best: MatchedRoute<R> | null = null;
  let bestSpecificity = -1;

  for (const route of routes) {
    const routeSegments = segmentsOf(route.path);
    if (routeSegments.length !== requested.length) continue;

    const params: Record<string, string> = {};
    let specificity = 0;
    let matched = true;

    for (const [index, routeSegment] of routeSegments.entries()) {
      const requestedSegment = requested[index];
      if (requestedSegment === undefined) {
        matched = false;
        break;
      }
      if (routeSegment.startsWith(':')) {
        params[routeSegment.slice(1)] = requestedSegment;
      } else if (routeSegment === requestedSegment) {
        specificity += 1;
      } else {
        matched = false;
        break;
      }
    }

    if (matched && specificity > bestSpecificity) {
      best = { route, params };
      bestSpecificity = specificity;
    }
  }

  return best;
}
