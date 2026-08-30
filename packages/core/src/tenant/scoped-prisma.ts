import { rootPrisma, createTenantScopedClient, type TenantScopedPrismaClient } from '@quetzal/db';
import { getCurrentTenant } from './tenant-context.js';

export function getTenantScopedPrisma(): TenantScopedPrismaClient {
  const { tenantId } = getCurrentTenant();
  return createTenantScopedClient(rootPrisma, tenantId) as TenantScopedPrismaClient;
}
