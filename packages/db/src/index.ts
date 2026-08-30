export { newId } from './id.js';
export { rootPrisma, createRootPrismaClient, createTenantScopedClient } from './clients.js';
export type { RootPrismaClient, TenantScopedPrismaClient } from './clients.js';
export { TenantScopeViolationError } from './errors.js';
export { modelHasTenantId } from './model-tenant-registry.js';
