import { newId } from '@quetzal/db';
import type { QuetzalRole, Locale } from '../../module-contract';

export function aUser(overrides: Partial<{ id: string; email: string; name: string; locale: Locale }> = {}) {
  return {
    id: overrides.id ?? newId(),
    email: overrides.email ?? 'test@quetzal.dev',
    name: overrides.name ?? 'Test User',
    locale: overrides.locale ?? ('fr' as Locale),
  };
}

export function aTenant(overrides: Partial<{ id: string; slug: string; name: string }> = {}) {
  return {
    id: overrides.id ?? newId(),
    slug: overrides.slug ?? 'test-tenant',
    name: overrides.name ?? 'Test Tenant',
  };
}

export function aTenantContext(overrides: Partial<{ tenantId: string; userId: string; role: QuetzalRole }> = {}) {
  return {
    tenantId: overrides.tenantId ?? newId(),
    userId: overrides.userId ?? newId(),
    role: overrides.role ?? ('creator' as QuetzalRole),
    requestId: newId(),
  };
}
