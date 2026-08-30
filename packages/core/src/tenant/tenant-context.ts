import { AsyncLocalStorage } from 'node:async_hooks';
import type { QuetzalRole, Locale } from '../module-contract';

export interface TenantExecutionContext {
  tenantId: string;
  userId?: string;
  role?: QuetzalRole;
  locale?: Locale;
  requestId: string;
}

export const tenantStore = new AsyncLocalStorage<TenantExecutionContext>();

export function getCurrentTenant(): TenantExecutionContext {
  const ctx = tenantStore.getStore();
  if (!ctx) throw new Error('No tenant context — code appelé hors requête ?');
  return ctx;
}

export function tryGetCurrentTenant(): TenantExecutionContext | undefined {
  return tenantStore.getStore();
}
