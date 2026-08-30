import { TenantScopeViolationError } from './errors.js';

// Prisma operation args are heterogeneous per model+operation; typing Args precisely
// would require Prisma.Args<Model, Op> per call site, which is impractical at this
// dispatch layer. The `any` is scoped to arg-shape juggling only.
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
    case 'updateManyAndReturn':
    case 'delete':
    case 'deleteMany': {
      const where = { ...(next.where ?? {}) };
      checkTenantMismatch(where.tenantId, tenantId, operation, model);
      where.tenantId = tenantId;
      next.where = where;

      if (
        operation === 'update' ||
        operation === 'updateMany' ||
        operation === 'updateManyAndReturn'
      ) {
        const data = { ...(next.data ?? {}) };
        checkTenantMismatch(data.tenantId, tenantId, operation, model);
        // write is scoped by where; tenantId in data would silently drop the row scope
        if ('tenantId' in data) delete data.tenantId;
        next.data = data;
      }
      break;
    }

    case 'create': {
      const data = { ...(next.data ?? {}) };
      checkTenantMismatch(data.tenantId, tenantId, operation, model);
      data.tenantId = tenantId;
      next.data = data;
      break;
    }

    case 'upsert': {
      const where = { ...(next.where ?? {}) };
      checkTenantMismatch(where.tenantId, tenantId, operation, model);
      where.tenantId = tenantId;
      next.where = where;

      const create = { ...(next.create ?? {}) };
      checkTenantMismatch(create.tenantId, tenantId, operation, model);
      create.tenantId = tenantId;
      next.create = create;

      const update = { ...(next.update ?? {}) };
      checkTenantMismatch(update.tenantId, tenantId, operation, model);
      // write is scoped by where; tenantId in update would silently drop the row scope
      if ('tenantId' in update) delete update.tenantId;
      next.update = update;
      break;
    }

    case 'createMany':
    case 'createManyAndReturn': {
      const data = Array.isArray(next.data) ? next.data : [next.data];
      next.data = data.map((item: Args) => {
        checkTenantMismatch(item.tenantId, tenantId, operation, model);
        return { ...item, tenantId };
      });
      break;
    }

    default:
      throw new TenantScopeViolationError(null, tenantId, operation, model);
  }

  return next;
}
