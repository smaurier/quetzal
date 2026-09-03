import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { MESSAGE_METADATA } from '@nestjs/websockets/constants';
import { canEmitWsEvent, logger, type QuetzalRole } from '@quetzal/core';
import type { WsRegistry } from './ws-policies.js';

interface WsClient {
  nsp?: { name?: string };
  data?: { role?: QuetzalRole };
}

/**
 * Authorizes each WS message against `permissions['ws:<event>']` of the module owning the
 * namespace. Identity comes from the handshake (QuetzalIoAdapter). Fail closed.
 */
@Injectable()
export class WsPermissionsGuard implements CanActivate {
  constructor(private readonly registry: WsRegistry) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'ws') return true;

    const client = context.switchToWs().getClient<WsClient>();
    const namespace = client.nsp?.name ?? '';
    const event = Reflect.getMetadata(MESSAGE_METADATA, context.getHandler()) as string | undefined;
    const role = client.data?.role;

    const permissions = this.registry.permissions(namespace);
    if (!permissions) throw this.refuse(namespace, event, role, 'namespace owned by no module');
    if (!role) throw this.refuse(namespace, event, role, 'no identity on the socket');
    if (!event) throw this.refuse(namespace, event, role, 'handler without a message name');
    if (!canEmitWsEvent(permissions, event, role)) throw this.refuse(namespace, event, role, 'role not allowed for this event');

    return true;
  }

  private refuse(namespace: string, event: string | undefined, role: string | undefined, reason: string): WsException {
    logger.warn({ namespace, event, role, reason }, 'ws message refused');
    return new WsException('forbidden');
  }
}
