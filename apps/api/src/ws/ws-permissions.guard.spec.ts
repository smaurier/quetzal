import { describe, it, expect } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import type { QuetzalModuleManifest } from '@quetzal/core';
import { WsPermissionsGuard } from './ws-permissions.guard';
import { buildWsRegistry } from './ws-policies';

const manifest = { slug: 'hello', permissions: { 'ws:ping': ['owner', 'guest'] } } as unknown as QuetzalModuleManifest;
const guard = new WsPermissionsGuard(buildWsRegistry([manifest]));

function context(opts: { type?: string; namespace?: string; role?: string; event?: string }): ExecutionContext {
  const handler = () => undefined;
  if (opts.event) Reflect.defineMetadata('message', opts.event, handler);
  return {
    getType: () => opts.type ?? 'ws',
    getHandler: () => handler,
    switchToWs: () => ({ getClient: () => ({ nsp: { name: opts.namespace ?? '/ws/hello' }, data: { role: opts.role } }) }),
  } as unknown as ExecutionContext;
}

// The manifest matrix is the authorization source of truth for WS events (CLAUDE.md §7).
describe('WsPermissionsGuard', () => {
  it('lets non-websocket contexts through untouched', () => {
    expect(guard.canActivate(context({ type: 'http' }))).toBe(true);
  });

  it('allows a role listed for the event', () => {
    expect(guard.canActivate(context({ role: 'guest', event: 'ping' }))).toBe(true);
  });

  it('refuses a role not listed for the event', () => {
    expect(() => guard.canActivate(context({ role: 'learner', event: 'ping' }))).toThrow(WsException);
  });

  it('refuses an event the manifest does not declare', () => {
    expect(() => guard.canActivate(context({ role: 'owner', event: 'draw' }))).toThrow(WsException);
  });

  it('refuses a client whose handshake left no identity', () => {
    expect(() => guard.canActivate(context({ event: 'ping' }))).toThrow(WsException);
  });

  it('refuses a namespace owned by no module', () => {
    expect(() => guard.canActivate(context({ namespace: '/ws/loto', role: 'owner', event: 'ping' }))).toThrow(WsException);
  });
});
