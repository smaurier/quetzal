import { describe, it, expect, vi, beforeEach } from 'vitest';

const ioMock = vi.fn(() => ({ on: vi.fn(), emit: vi.fn() }));
vi.mock('socket.io-client', () => ({ io: ioMock }));
vi.mock('./api-client.js', () => ({ apiClient: () => ({ getToken: async () => 'jwt-de-test' }) }));

const { connectSocket } = await import('./socket.js');

describe('connectSocket', () => {
  beforeEach(() => ioMock.mockClear());

  it('transmet une query au handshake, pour dire quelle session on regarde', async () => {
    await connectSocket('ws/loto', { query: { gameId: 'game-1' } });
    expect(ioMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ query: { gameId: 'game-1' } }),
    );
  });

  it('n envoie aucune query quand il n y en a pas', async () => {
    await connectSocket('ws/loto');
    const options = ioMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(options['query']).toBeUndefined();
  });

  it('un jeton invité reste prioritaire sur le JWT', async () => {
    await connectSocket('ws/loto', { guestToken: 'jeton-invité' });
    const options = ioMock.mock.calls[0]?.[1] as { auth: Record<string, string> };
    expect(options.auth['guestToken']).toBe('jeton-invité');
    expect(options.auth['token']).toBeUndefined();
  });
});
