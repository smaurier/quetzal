import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import { WebSocketGateway, SubscribeMessage, ConnectedSocket } from '@nestjs/websockets';
import type { Socket as ServerSocket } from 'socket.io';
import { getCurrentTenant, tryGetCurrentTenant, type QuetzalModuleManifest, type TenantExecutionContext } from '@quetzal/core';
import { QuetzalIoAdapter } from './quetzal-io.adapter';
import { buildWsRegistry } from './ws-policies';

@WebSocketGateway({ namespace: 'ws/hello' })
class ProbeGateway {
  // Not wrapped by Nest in a try/catch (unlike @SubscribeMessage handlers below), so this
  // must never let getCurrentTenant() throw past it — a thrown handleConnection would
  // reach the raw `server.on('connection', ...)` listener and crash the process.
  handleConnection(client: ServerSocket): void {
    let context: TenantExecutionContext | null;
    try {
      context = getCurrentTenant();
    } catch {
      context = null;
    }
    client.emit('connected', context);
  }

  @SubscribeMessage('ping')
  ping(_body: unknown, @ConnectedSocket() client: ServerSocket) {
    return { event: 'pong', data: { seenAs: client.data } };
  }

  // Deliberately throws (via getCurrentTenant, not the non-throwing tryGetCurrentTenant)
  // when no context is open — Nest's WsProxy catches it and emits an `exception` event
  // instead of `tenant`, so a caller with no resolvable tenant never sees this succeed.
  @SubscribeMessage('whoami')
  async whoami(): Promise<{ event: string; data: TenantExecutionContext }> {
    await Promise.resolve(); // proves the context survives past an await, not just sync code
    return { event: 'tenant', data: getCurrentTenant() };
  }

  @SubscribeMessage('context-present')
  contextPresent() {
    return { event: 'context-present', data: { present: tryGetCurrentTenant() !== undefined } };
  }
}

const manifest = {
  slug: 'hello',
  permissions: { 'ws:ping': ['owner', 'guest'] },
  guestAccess: { enabled: true, tokenTTL: 60, requireDisplayName: true, maxConcurrentPerSession: 10 },
} as unknown as QuetzalModuleManifest;

const verifiers = {
  verifyUserToken: vi.fn(async (token: string) => {
    if (token === 'good-jwt') return { userId: 'u1', tenantId: 't1', role: 'owner', locale: 'fr' };
    if (token === 'good-jwt-t2') return { userId: 'u3', tenantId: 't2', role: 'owner', locale: 'fr' };
    if (token === 'good-jwt-no-tenant') return { userId: 'u2', tenantId: null, role: 'owner', locale: 'fr' };
    throw new Error('bad signature');
  }),
  verifyGuestToken: vi.fn(async (token: string) => {
    if (token === 'other-module') {
      return { tenantId: 't1', sessionId: 's1', guestId: 'g1', displayName: 'Ana', moduleSlug: 'loto', iat: 0, exp: 0 };
    }
    if (token !== 'good-guest') throw new Error('bad signature');
    return { tenantId: 't1', sessionId: 's1', guestId: 'g1', displayName: 'Ana', moduleSlug: 'hello', iat: 0, exp: 0 };
  }),
};

// The platform authenticates a module namespace once, at handshake time, and puts the
// identity on socket.data. Without it any client could open /ws/<slug> and emit.
describe('QuetzalIoAdapter (integration)', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ providers: [ProbeGateway] }).compile();
    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new QuetzalIoAdapter(app, { registry: buildWsRegistry([manifest]), verifiers }));
    await app.listen(0);
    const port = (app.getHttpServer().address() as { port: number }).port;
    url = `http://127.0.0.1:${port}/ws/hello`;
  });

  afterAll(async () => { await app.close(); });

  function attempt(auth: Record<string, string>): Promise<{ ok: true; socket: Socket } | { ok: false; message: string }> {
    return new Promise((resolve) => {
      const socket = io(url, { transports: ['websocket'], auth, timeout: 5000, reconnection: false });
      socket.on('connect', () => resolve({ ok: true, socket }));
      socket.on('connect_error', (e) => { socket.close(); resolve({ ok: false, message: e.message }); });
    });
  }

  function waitFor<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
      socket.on(event, resolve);
      setTimeout(() => reject(new Error(`no "${event}" event within ${timeoutMs}ms`)), timeoutMs);
    });
  }

  // The `connected` listener is registered synchronously, before the socket even starts
  // connecting — so it cannot miss the server's `connected` emission (handleConnection
  // fires right after the transport connects, and socket.io does not buffer events for
  // listeners registered late).
  function connectAndCapture(auth: Record<string, string>): { socket: Socket; connected: Promise<TenantExecutionContext | null> } {
    const socket = io(url, { transports: ['websocket'], auth, timeout: 5000, reconnection: false });
    const connected = waitFor<TenantExecutionContext | null>(socket, 'connected');
    return { socket, connected };
  }

  it('refuses a handshake without any token', async () => {
    const r = await attempt({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/no token/i);
  });

  it('refuses an invalid user token', async () => {
    const r = await attempt({ token: 'forged' });
    expect(r.ok).toBe(false);
  });

  it('refuses a guest token minted for another module', async () => {
    const r = await attempt({ guestToken: 'other-module' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/loto/);
  });

  it('accepts a signed-in user and exposes the identity to the gateway', async () => {
    const r = await attempt({ token: 'good-jwt' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pong = await new Promise<{ seenAs: Record<string, unknown> }>((resolve, reject) => {
      r.socket.on('pong', resolve);
      r.socket.emit('ping', {});
      setTimeout(() => reject(new Error('no pong')), 5000);
    });
    expect(pong.seenAs).toMatchObject({ role: 'owner', userId: 'u1', tenantId: 't1' });
    r.socket.close();
  });

  it('accepts a guest of the module and exposes the guest identity', async () => {
    const r = await attempt({ guestToken: 'good-guest' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pong = await new Promise<{ seenAs: Record<string, unknown> }>((resolve, reject) => {
      r.socket.on('pong', resolve);
      r.socket.emit('ping', {});
      setTimeout(() => reject(new Error('no pong')), 5000);
    });
    expect(pong.seenAs).toMatchObject({ role: 'guest', guestId: 'g1', displayName: 'Ana', sessionId: 's1' });
    r.socket.close();
  });

  // A WS connection never passes through Express middleware, so `tenantStore` had no
  // store for it: any handler reaching a tenant-scoped repository threw
  // TenantContextMissingError. The platform now opens the context at the same place
  // identity is resolved — the handshake, in QuetzalIoAdapter — covering both places a
  // module gateway runs: handleConnection, and every subsequent message dispatch.
  describe('tenant execution context', () => {
    it('is visible in handleConnection, the first entry point', async () => {
      const { socket, connected } = connectAndCapture({ token: 'good-jwt' });
      const ctx = await connected;
      expect(ctx).toMatchObject({ tenantId: 't1', userId: 'u1', role: 'owner' });
      socket.close();
    });

    it('is visible inside a message handler, including after an await', async () => {
      const { socket, connected } = connectAndCapture({ token: 'good-jwt' });
      await connected;
      socket.emit('whoami', {});
      const tenant = await waitFor<TenantExecutionContext>(socket, 'tenant');
      expect(tenant).toMatchObject({ tenantId: 't1', userId: 'u1', role: 'owner' });
      socket.close();
    });

    it('gives the two entry points of one connection the same requestId', async () => {
      const { socket, connected } = connectAndCapture({ token: 'good-jwt' });
      const onConnect = await connected;
      socket.emit('whoami', {});
      const onMessage = await waitFor<TenantExecutionContext>(socket, 'tenant');
      expect(onConnect?.requestId).toEqual(onMessage.requestId);
      socket.close();
    });

    it('gives a guest socket a tenant id and the guest role, but no userId', async () => {
      const { socket, connected } = connectAndCapture({ guestToken: 'good-guest' });
      await connected;
      socket.emit('whoami', {});
      const tenant = await waitFor<Record<string, unknown>>(socket, 'tenant');
      expect(tenant['tenantId']).toBe('t1');
      expect(tenant['role']).toBe('guest');
      expect('userId' in tenant).toBe(false);
      socket.close();
    });

    it('opens no context, and refuses no connection, for a user with no resolvable tenant', async () => {
      const { socket, connected } = connectAndCapture({ token: 'good-jwt-no-tenant' });
      const ctx = await connected;
      expect(ctx).toBeNull();

      const contextPresent = await new Promise<{ present: boolean }>((resolve, reject) => {
        socket.on('context-present', resolve);
        socket.emit('context-present', {});
        setTimeout(() => reject(new Error('no context-present event')), 5000);
      });
      expect(contextPresent.present).toBe(false);
      socket.close();
    });

    it('never leaks one tenant into the other when two sockets of different tenants are connected concurrently', async () => {
      const a = connectAndCapture({ token: 'good-jwt' });
      const b = connectAndCapture({ token: 'good-jwt-t2' });
      await Promise.all([a.connected, b.connected]);

      const [tenantA, tenantB] = await Promise.all([
        (async () => {
          a.socket.emit('whoami', {});
          return waitFor<TenantExecutionContext>(a.socket, 'tenant');
        })(),
        (async () => {
          b.socket.emit('whoami', {});
          return waitFor<TenantExecutionContext>(b.socket, 'tenant');
        })(),
      ]);

      expect(tenantA.tenantId).toBe('t1');
      expect(tenantB.tenantId).toBe('t2');
      a.socket.close();
      b.socket.close();
    });
  });
});
