import { describe, it, expect } from 'vitest';
import { jwksUrl } from './jwks-url';

// Better-Auth 1.1.x (jwt plugin) serves the key set at /api/auth/jwks.
// The API used /api/auth/jwt/jwks, which 404s: every Bearer call failed with
// "Expected 200 OK from the JSON Web Key Set HTTP response" in production.
describe('jwksUrl', () => {
  it('points at the Better-Auth jwks endpoint of the host', () => {
    expect(jwksUrl('https://host.example').toString()).toBe('https://host.example/api/auth/jwks');
  });

  it('tolerates a trailing slash in HOST_URL', () => {
    expect(jwksUrl('https://host.example/').pathname).toBe('/api/auth/jwks');
  });
});
