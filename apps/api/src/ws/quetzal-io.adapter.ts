import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext } from '@nestjs/common';
import type { Namespace, Server, ServerOptions, Socket } from 'socket.io';
import { resolveSocketIdentity, logger, tenantStore, type HandshakeVerifiers, type TenantExecutionContext } from '@quetzal/core';
import { newId } from '@quetzal/db';
import type { WsRegistry } from './ws-policies.js';
import { buildSocketTenantContext } from './socket-tenant-context.js';

export interface QuetzalIoAdapterDeps {
  registry: WsRegistry;
  verifiers: HandshakeVerifiers;
}

/**
 * Socket.io adapter of the platform. Every module namespace (`/ws/<slug>`) is authenticated
 * once, at handshake time: the identity lands on `socket.data` and the gateway can trust it.
 * CORS is owned here, not by module gateways.
 */
export class QuetzalIoAdapter extends IoAdapter {
  constructor(app: INestApplicationContext, private readonly deps: QuetzalIoAdapterDeps) {
    super(app);
  }

  override createIOServer(port: number, options?: Partial<ServerOptions>): Server {
    const hostUrl = process.env['HOST_URL'] ?? 'http://localhost:3000';
    return super.createIOServer(port, {
      ...options,
      cors: { origin: hostUrl.split(','), credentials: true },
    }) as Server;
  }

  override bindClientConnect(server: Namespace, callback: (socket: Socket) => void): void {
    const policy = this.deps.registry.policy(server.name);
    // Handshake happens once per connection, before Nest's own connection callback below —
    // its `next()`/`.then()` order guarantees an entry exists here (possibly `undefined`,
    // for a resolvable-but-tenant-less identity) by the time that callback runs.
    const contexts = new WeakMap<Socket, TenantExecutionContext | undefined>();

    if (policy) {
      server.use((socket, next) => {
        const auth = (socket.handshake.auth ?? {}) as { token?: string; guestToken?: string };
        resolveSocketIdentity(auth, policy, this.deps.verifiers)
          .then((identity) => {
            socket.data = { ...socket.data, ...identity };
            contexts.set(socket, buildSocketTenantContext(identity, newId()));
            next();
          })
          .catch((err: Error) => {
            logger.warn({ namespace: server.name, reason: err.message }, 'ws handshake refused');
            next(err);
          });
      });
    } else {
      logger.warn({ namespace: server.name }, 'ws namespace outside the module convention — left unauthenticated');
    }

    super.bindClientConnect(server, (socket: Socket) => {
      const context = contexts.get(socket);

      // Runs before each incoming packet is dispatched to its handler (verified against
      // socket.io's `Socket#dispatch`: it schedules the actual event emission via
      // `process.nextTick`, called synchronously from `next()` here — and
      // AsyncLocalStorage keeps its store across a nextTick scheduled from inside
      // `run()`'s callback). Calling `next()` from within `tenantStore.run` therefore
      // puts the whole dispatch — and so the handler, sync or async — in the context.
      socket.use((_packet, next) => {
        if (context) tenantStore.run(context, next);
        else next();
      });

      if (context) tenantStore.run(context, () => callback(socket));
      else callback(socket);
    });
  }
}
