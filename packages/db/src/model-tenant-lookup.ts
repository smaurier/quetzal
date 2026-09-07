import { MODEL_HAS_TENANT_ID } from './model-tenant-registry.js';
import { UnknownTenantModelError } from './errors.js';

// `registry` defaults to the generated (gitignored) map so production callers
// need not pass it; tests inject a fixed literal so they never depend on
// generated output. A model absent from the map means the registry is stale
// or the build never ran — continuing would query without a tenant filter,
// so this fails closed rather than defaulting to "no tenantId column".
export function modelHasTenantId(
  model: string,
  registry: Readonly<Record<string, boolean>> = MODEL_HAS_TENANT_ID,
): boolean {
  if (!(model in registry)) {
    throw new UnknownTenantModelError(model);
  }
  return registry[model] === true;
}
