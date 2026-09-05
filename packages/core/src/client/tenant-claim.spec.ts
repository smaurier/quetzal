import { describe, it, expect } from 'vitest';
import { tenantIdFromToken, getCurrentTenantId } from './tenant-claim.js';

// Le jeton Better-Auth (definePayload, packages/auth/src/config.ts) porte
// tenantId en clair au premier niveau. Un jeton « none » suffit ici : le
// navigateur n a pas à vérifier la signature, seul le serveur le fait.
function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(payload)}.`;
}

describe('tenantIdFromToken', () => {
  it('lit tenantId dans la charge utile sans vérifier la signature', () => {
    const token = fakeJwt({ userId: 'u-1', tenantId: 'org-1', locale: 'fr' });
    expect(tenantIdFromToken(token)).toBe('org-1');
  });

  it('rend null sur un jeton illisible plutôt que de lever', () => {
    expect(tenantIdFromToken('pas-un-jeton')).toBeNull();
    expect(tenantIdFromToken('')).toBeNull();
  });

  it('rend null quand la revendication tenantId est absente ou non une chaîne', () => {
    expect(tenantIdFromToken(fakeJwt({ userId: 'u-1' }))).toBeNull();
    expect(tenantIdFromToken(fakeJwt({ userId: 'u-1', tenantId: null }))).toBeNull();
  });

  it('lit quand même un jeton expiré : exp n est pas vérifié ici, le serveur le fait à chaque appel', () => {
    const token = fakeJwt({ userId: 'u-1', tenantId: 'org-1', exp: 1 });
    expect(tenantIdFromToken(token)).toBe('org-1');
  });
});

describe('getCurrentTenantId', () => {
  it('rend null sans lever quand aucun jeton n est disponible', async () => {
    const result = await getCurrentTenantId(() => Promise.resolve(null));
    expect(result).toBeNull();
  });

  it('rend le tenantId du jeton courant', async () => {
    const token = fakeJwt({ userId: 'u-1', tenantId: 'org-9' });
    const result = await getCurrentTenantId(() => Promise.resolve(token));
    expect(result).toBe('org-9');
  });

  it('rend null sans lever sur un jeton illisible', async () => {
    const result = await getCurrentTenantId(() => Promise.resolve('pas-un-jeton'));
    expect(result).toBeNull();
  });
});
