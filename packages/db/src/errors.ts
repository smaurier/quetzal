export class TenantScopeViolationError extends Error {
  constructor(
    public readonly attempted: string | null,
    public readonly current: string,
    public readonly operation: string,
    public readonly model: string,
  ) {
    super(`Tenant scope violation on ${model}.${operation}: attempted tenantId "${attempted}" but current is "${current}"`);
    this.name = 'TenantScopeViolationError';
  }
}

// Configuration failure, not a cross-tenant access attempt: the model exists
// in the Prisma schema but the generated registry has no entry for it, which
// means the registry is stale or `prebuild` never ran. Kept distinct from
// TenantScopeViolationError so the two causes never get confused in logs.
export class UnknownTenantModelError extends Error {
  constructor(public readonly model: string) {
    super(
      `Unknown tenant scope for model "${model}": absent from model-tenant-registry.ts. ` +
        `The generated registry is stale or was never built — run "pnpm --filter @quetzal/db build" to regenerate it.`,
    );
    this.name = 'UnknownTenantModelError';
  }
}
