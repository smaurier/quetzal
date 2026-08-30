import { TenantScopeViolationError } from './errors';

type Args = Record<string, any>;

function checkTenantMismatch(
  actualValue: unknown,
  expected: string,
  op: string,
  model: string,
): void {
  if (actualValue !== undefined && actualValue !== null && actualValue !== expected) {
    throw new TenantScopeViolationError(
      typeof actualValue === 'string' ? actualValue : null,
      expected,
      op,
      model,
    );
  }
}

export function applyTenantConstraint(
  model: string,
  operation: string,
  args: Args,
  tenantId: string,
): Args {
  const next: Args = { ...args };

  switch (operation) {
    case 'findFirst':
    case 'findFirstOrThrow':
    case 'findMany':
    case 'findUnique':
    case 'findUniqueOrThrow':
    case 'count':
    case 'aggregate':
    case 'groupBy':
    case 'update':
    case 'updateMany':
    case 'delete':
    case 'deleteMany': {
      const where = { ...(next.where ?? {}) };
      checkTenantMismatch(where.tenantId, tenantId, operation, model);
      where.tenantId = tenantId;
      next.where = where;

      if (operation === 'update' || operation === 'updateMany') {
        const data = { ...(next.data ?? {}) };
        checkTenantMismatch(data.tenantId, tenantId, operation, model);
        if ('tenantId' in data) delete data.tenantId;
        next.data = data;
      }
      break;
    }

    case 'create':
    case 'upsert': {
      const data = { ...(next.data ?? {}) };
      checkTenantMismatch(data.tenantId, tenantId, operation, model);
      data.tenantId = tenantId;
      next.data = data;

      if (operation === 'upsert') {
        const where = { ...(next.where ?? {}) };
        checkTenantMismatch(where.tenantId, tenantId, operation, model);
        where.tenantId = tenantId;
        next.where = where;
      }
      break;
    }

    case 'createMany': {
      const data = Array.isArray(next.data) ? next.data : [next.data];
      next.data = data.map((item: Args) => {
        checkTenantMismatch(item.tenantId, tenantId, operation, model);
        return { ...item, tenantId };
      });
      break;
    }
  }

  return next;
}
