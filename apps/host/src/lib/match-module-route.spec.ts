import { describe, it, expect } from 'vitest';
import { matchModuleRoute } from './match-module-route';

// Fixes the silent mismatch (manifest.uiRoutes.find(r => r.path === p) ?? uiRoutes[0]):
// a declared `games/:gameId` route could never match a real path like `games/abc123`,
// and the lookup fell back to uiRoutes[0] with no error — wrong screen, no signal.
describe('matchModuleRoute', () => {
  it('matches a literal path exactly', () => {
    const routes = [{ path: 'settings' }, { path: 'billing' }];
    const result = matchModuleRoute(routes, 'settings');
    expect(result).toEqual({ route: routes[0], params: {} });
  });

  it('does not match a different literal path', () => {
    const routes = [{ path: 'settings' }];
    const result = matchModuleRoute(routes, 'billing');
    expect(result).toBeNull();
  });

  it('matches a :param segment and captures its value', () => {
    const routes = [{ path: 'games/:gameId' }];
    const result = matchModuleRoute(routes, 'games/abc123');
    expect(result).toEqual({ route: routes[0], params: { gameId: 'abc123' } });
  });

  it('does not match the parent segment alone', () => {
    const routes = [{ path: 'games/:gameId' }];
    const result = matchModuleRoute(routes, 'games');
    expect(result).toBeNull();
  });

  it('does not match a path with one extra trailing segment', () => {
    const routes = [{ path: 'games/:gameId' }];
    const result = matchModuleRoute(routes, 'games/abc/extra');
    expect(result).toBeNull();
  });

  it('matches the empty path against the module root route', () => {
    const routes = [{ path: '' }, { path: 'games/:gameId' }];
    const result = matchModuleRoute(routes, '');
    expect(result).toEqual({ route: routes[0], params: {} });
  });

  it('prefers a literal route over a param route at the same position', () => {
    const literal = { path: 'games/new' };
    const param = { path: 'games/:gameId' };
    const result = matchModuleRoute([param, literal], 'games/new');
    expect(result).toEqual({ route: literal, params: {} });
  });

  it('still matches the param route when no literal route fits', () => {
    const literal = { path: 'games/new' };
    const param = { path: 'games/:gameId' };
    const result = matchModuleRoute([literal, param], 'games/abc123');
    expect(result).toEqual({ route: param, params: { gameId: 'abc123' } });
  });

  it('captures multiple params in one path', () => {
    const routes = [{ path: 'games/:gameId/rounds/:roundId' }];
    const result = matchModuleRoute(routes, 'games/g1/rounds/r2');
    expect(result).toEqual({ route: routes[0], params: { gameId: 'g1', roundId: 'r2' } });
  });

  it('returns null when no route matches anything, instead of guessing', () => {
    const routes = [{ path: '' }, { path: 'games/:gameId' }];
    const result = matchModuleRoute(routes, 'nonexistent/deeply/nested');
    expect(result).toBeNull();
  });
});
