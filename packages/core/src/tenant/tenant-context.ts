import { AsyncLocalStorage } from 'node:async_hooks';
import type { QuetzalRole, Locale } from '../module-contract.js';
import { TenantContextMissingError } from '../errors.js';

export interface TenantExecutionContext {
  tenantId: string;
  userId?: string;
  /** Nom affichable de l'utilisateur, posé par la plateforme (#91). Jamais pour un invité. */
  userName?: string;
  role?: QuetzalRole;
  locale?: Locale;
  requestId: string;
}

export const tenantStore = new AsyncLocalStorage<TenantExecutionContext>();

export function getCurrentTenant(): TenantExecutionContext {
  const ctx = tenantStore.getStore();
  if (!ctx) throw new TenantContextMissingError();
  return ctx;
}

export function tryGetCurrentTenant(): TenantExecutionContext | undefined {
  return tenantStore.getStore();
}
