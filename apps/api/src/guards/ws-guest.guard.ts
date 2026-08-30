import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { verifyGuestToken } from '@quetzal/core';

@Injectable()
export class WsGuestGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<{ handshake?: { auth?: { guestToken?: string } }; data?: Record<string, unknown> }>();
    const token = client.handshake?.auth?.guestToken;
    if (!token) return false;
    try {
      const payload = await verifyGuestToken(token);
      client.data = { ...(client.data ?? {}), role: 'guest', ...payload };
      return true;
    } catch {
      return false;
    }
  }
}
