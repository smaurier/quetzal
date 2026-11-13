import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import { tenantStore, type TenantExecutionContext } from '@quetzal/core';
import { TenantMiddleware } from './tenant.middleware';
import type { AuthContext } from './jwt-auth.middleware';

/** Le contexte que verrait un handler derriere le middleware. */
function contexteVu(auth: AuthContext): TenantExecutionContext | undefined {
  const req = { authContext: auth, requestId: 'req-1' } as unknown as Request;
  let vu: TenantExecutionContext | undefined;
  new TenantMiddleware().use(req, {} as Response, () => {
    vu = tenantStore.getStore();
  });
  return vu;
}

describe('TenantMiddleware, nom de l utilisateur (#91)', () => {
  const auth: AuthContext = { userId: 'u1', tenantId: 't1', role: 'owner', locale: 'fr', name: 'Elda' };

  it('pose le nom du jeton dans le contexte', () => {
    expect(contexteVu(auth)?.userName).toBe('Elda');
  });

  /** Un jeton emis avant #91 : la cle est omise, jamais `undefined` (exactOptionalPropertyTypes). */
  it('omet le nom quand le jeton n en porte pas', () => {
    const { name: _name, ...sansNom } = auth;
    const ctx = contexteVu(sansNom);
    expect(ctx && 'userName' in ctx).toBe(false);
  });
});
