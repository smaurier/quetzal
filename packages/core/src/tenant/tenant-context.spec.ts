import { describe, it, expect } from 'vitest';
import { tenantStore, getCurrentTenant, tryGetCurrentTenant } from './tenant-context.js';

describe('tenantStore', () => {
  it('exposes tenant context inside run scope', async () => {
    const ctx = { tenantId: 't-A', requestId: 'req-1' };
    const result = await new Promise<any>((resolve) => {
      tenantStore.run(ctx, () => {
        resolve(getCurrentTenant());
      });
    });
    expect(result.tenantId).toBe('t-A');
  });

  it('propagates through async boundaries', async () => {
    const ctx = { tenantId: 't-B', requestId: 'req-2' };
    const result = await new Promise<any>((resolve) => {
      tenantStore.run(ctx, async () => {
        await new Promise(r => setImmediate(r));
        resolve(getCurrentTenant());
      });
    });
    expect(result.tenantId).toBe('t-B');
  });

  it('getCurrentTenant throws outside scope', () => {
    expect(() => getCurrentTenant()).toThrow(/No tenant context/);
  });

  it('tryGetCurrentTenant returns undefined outside scope', () => {
    expect(tryGetCurrentTenant()).toBeUndefined();
  });
});
