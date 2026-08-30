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
