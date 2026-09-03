import { describe, it, expect, afterEach } from 'vitest';
import { apiBaseUrl, socketUrl } from './api-url';

// Vercel rewrites proxy HTTP but never WebSocket upgrades, so sockets must target the API
// origin directly (NEXT_PUBLIC_API_URL). HTTP calls keep going through the same-origin
// rewrite (first-party cookies), hence '' when the variable is unset.
describe('apiBaseUrl / socketUrl', () => {
  const saved = process.env['NEXT_PUBLIC_API_URL'];
  afterEach(() => {
    if (saved === undefined) delete process.env['NEXT_PUBLIC_API_URL'];
    else process.env['NEXT_PUBLIC_API_URL'] = saved;
  });

  it('returns the configured API origin without trailing slash', () => {
    process.env['NEXT_PUBLIC_API_URL'] = 'https://api.example.com/';
    expect(apiBaseUrl()).toBe('https://api.example.com');
  });

  it('falls back to same-origin (empty base) when unset', () => {
    delete process.env['NEXT_PUBLIC_API_URL'];
    expect(apiBaseUrl()).toBe('');
  });

  it('builds the socket.io namespace url on the API origin', () => {
    process.env['NEXT_PUBLIC_API_URL'] = 'https://api.example.com';
    expect(socketUrl('ws/hello')).toBe('https://api.example.com/ws/hello');
    expect(socketUrl('/ws/hello')).toBe('https://api.example.com/ws/hello');
  });
});
