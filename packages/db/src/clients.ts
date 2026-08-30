import { PrismaClient } from '@prisma/client';
import { applyTenantConstraint } from './tenant-scope.js';
import { modelHasTenantId } from './model-tenant-registry.js';

export type RootPrismaClient = PrismaClient & { readonly __brand: 'root' };

let _rootClient: RootPrismaClient | null = null;

export function createRootPrismaClient(): RootPrismaClient {
  if (_rootClient) return _rootClient;
  _rootClient = new PrismaClient() as RootPrismaClient;
  return _rootClient;
}

// Lazy Proxy — Better-Auth CLI imports the auth config before PrismaClient is generated.
// Do NOT eagerly instantiate. Instantiate on first property access.
export const rootPrisma: RootPrismaClient = new Proxy({} as RootPrismaClient, {
  get(_target, prop) {
    const client = createRootPrismaClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});

export type TenantScopedPrismaClient = ReturnType<typeof createTenantScopedClient>;

const cache = new Map<string, { client: PrismaClient; lastUsed: number }>();
const MAX_CACHE = 1000;
const TTL_MS = 5 * 60_000;

export function createTenantScopedClient(root: RootPrismaClient, tenantId: string): PrismaClient {
  const now = Date.now();
  const cached = cache.get(tenantId);
  if (cached && now - cached.lastUsed < TTL_MS) {
    cached.lastUsed = now;
    return cached.client;
  }

  const client = root.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (modelHasTenantId(model.charAt(0).toLowerCase() + model.slice(1))) {
            args = applyTenantConstraint(model, operation, args as Record<string, any>, tenantId);
          }
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;

  if (cache.size >= MAX_CACHE) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of cache) {
      if (v.lastUsed < oldestTime) { oldestTime = v.lastUsed; oldestKey = k; }
    }
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(tenantId, { client, lastUsed: now });
  return client;
}
