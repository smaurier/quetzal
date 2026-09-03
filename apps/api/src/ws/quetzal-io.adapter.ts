import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext } from '@nestjs/common';
import type { Namespace, Server, ServerOptions, Socket } from 'socket.io';
import { resolveSocketIdentity, logger, type HandshakeVerifiers } from '@quetzal/core';
import type { WsRegistry } from './ws-policies.js';

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
    if (policy) {
      server.use((socket, next) => {
        const auth = (socket.handshake.auth ?? {}) as { token?: string; guestToken?: string };
        resolveSocketIdentity(auth, policy, this.deps.verifiers)
          .then((identity) => {
            socket.data = { ...socket.data, ...identity };
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
    super.bindClientConnect(server, callback);
  }
}
