import { io, type Socket } from 'socket.io-client';
import { socketUrl } from './api-url.js';
import { apiClient } from './api-client.js';

export interface ConnectSocketOptions {
  /** Guest join: signed guest token from POST /api/guest-token. */
  guestToken?: string;
  /**
   * Subscription parameters passed at handshake. A guest gets their session id from
   * their token; an authenticated user does not, and must say what they are watching.
   * This is not an identity claim: tenant scoping alone still decides what is reachable.
   */
  query?: Record<string, string>;
}

/**
 * Open a socket.io connection to a module namespace on the API origin. Identity is
 * resolved at handshake by the platform adapter: `auth.token` for a user,
 * `auth.guestToken` for a guest.
 */
export async function connectSocket(
  namespace: string,
  options: ConnectSocketOptions = {},
): Promise<Socket> {
  const auth: Record<string, string> = {};
  if (options.guestToken) {
    auth['guestToken'] = options.guestToken;
  } else {
    const token = await apiClient().getToken();
    if (token) auth['token'] = token;
  }
  return io(socketUrl(namespace), {
    auth,
    transports: ['websocket'],
    withCredentials: true,
    ...(options.query === undefined ? {} : { query: options.query }),
  });
}
