import { io, type Socket } from 'socket.io-client';
import { socketUrl } from './api-url.js';
import { apiClient } from './api-client.js';

export interface ConnectSocketOptions {
  /** Guest join: signed guest token from POST /api/guest-token. */
  guestToken?: string;
}

/**
 * Open a socket.io connection to a module namespace on the API origin.
 * Authenticated users send their JWT as `auth.token` (WsJwtGuard); guests send
 * `auth.guestToken` (WsGuestGuard).
 */
export async function connectSocket(namespace: string, options: ConnectSocketOptions = {}): Promise<Socket> {
  const auth: Record<string, string> = {};
  if (options.guestToken) {
    auth['guestToken'] = options.guestToken;
  } else {
    const token = await apiClient().getToken();
    if (token) auth['token'] = token;
  }
  return io(socketUrl(namespace), { auth, transports: ['websocket'], withCredentials: true });
}
