import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, OnGatewayConnection } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { eventBus, rooms } from '@quetzal/core';

interface SocketData {
  role?: string;
  sessionId?: string;
  userId?: string;
  tenantId?: string;
}

@WebSocketGateway({ namespace: 'ws/hello', cors: { origin: '*', credentials: true } })
export class HelloGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  handleConnection(client: Socket) {
    const data = client.data as SocketData;
    if (data.role === 'guest' && data.sessionId) {
      client.join(rooms.session('hello', data.sessionId));
    }
  }

  @SubscribeMessage('ping')
  handlePing(@MessageBody() body: { at: number }, @ConnectedSocket() client: Socket) {
    const now = Date.now();
    const latencyMs = now - body.at;
    const data = client.data as SocketData;
    if (data.userId && data.tenantId) {
      eventBus.emit('hello.pinged', { userId: data.userId, tenantId: data.tenantId, latencyMs });
    }
    return { event: 'pong', data: { latencyMs, serverAt: now } };
  }
}
