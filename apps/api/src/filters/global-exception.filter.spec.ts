import { describe, it, expect, vi } from 'vitest';
import { TenantContextMissingError } from '@quetzal/core';
import { GlobalExceptionFilter } from './global-exception.filter';

function fakeHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/api/modules/hello/greet' }),
    }),
  } as never;
  return { host, status, json };
}

// A request that reaches a module route without a tenant context is an auth
// problem (JWT without tenantId), not a server crash: answer 401, not 500.
describe('GlobalExceptionFilter', () => {
  it('maps TenantContextMissingError to 401 tenant_context_missing', () => {
    const { host, status, json } = fakeHost();
    new GlobalExceptionFilter().catch(new TenantContextMissingError(), host);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'tenant_context_missing' }));
  });

  it('still maps unknown errors to 500', () => {
    const { host, status } = fakeHost();
    new GlobalExceptionFilter().catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
  });
});
