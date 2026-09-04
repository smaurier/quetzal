import type { Type } from '@nestjs/common';
import type { ComponentType } from 'react';
import type { z } from 'zod';
import type { RootPrismaClient, TenantScopedPrismaClient } from '@quetzal/db';
import type { Logger } from 'pino';

export const CONTRACT_VERSION = '1.0.0' as const;

export type QuetzalRole = 'owner' | 'admin' | 'creator' | 'learner' | 'guest';
export type Locale = 'fr' | 'en' | 'es';

export interface QuetzalModuleManifest {
  slug: string;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  version: string;
  contractVersion: `${number}.${number}.${number}`;
  enabledByDefault: boolean;
  apiModule: Type<unknown>;
  eventsPublished: readonly EventDefinition[];
  eventsSubscribed?: readonly EventSubscription[];
  uiRoutes: readonly QuetzalRoute[];
  navItem: QuetzalNavItem | null;
  guestJoinComponent?: () => Promise<{ default: ComponentType<GuestJoinProps> }>;
  permissions: PermissionMatrix;
  guestAccess?: GuestAccessConfig;
  rateLimits?: RateLimitConfig;
  prismaModels?: string;
  configSchema?: z.ZodTypeAny;
  onBoot?: (root: RootContext) => Promise<void>;
  onInstall?: (ctx: ModuleContext) => Promise<void>;
  onEnable?: (ctx: ModuleContext) => Promise<void>;
  onDisable?: (ctx: ModuleContext) => Promise<void>;
}

/**
 * Client-safe subset of the manifest. Modules export it from `<pkg>/client`; the host
 * (Next.js) imports ONLY this entry, so it must never reference the NestJS module,
 * lifecycle hooks or Prisma. The server manifest spreads it to avoid duplication.
 */
export type ClientModuleManifest = Pick<
  QuetzalModuleManifest,
  'slug' | 'name' | 'uiRoutes' | 'navItem' | 'guestJoinComponent'
>;

export interface EventDefinition {
  name: EventName;
  typeRef: string;
}

export interface EventSubscription {
  event: EventName;
  handler: (ctx: ModuleContext, payload: unknown) => Promise<void>;
}

export type EventName = `${string}.${string}` | `${string}.${string}.${string}`;

export interface QuetzalRoute {
  path: string;
  component: () => Promise<{ default: ComponentType<Readonly<Record<string, string>>> }>;
  requiredRoles: readonly QuetzalRole[];
  layout: 'shell' | 'full';
}

export interface QuetzalNavItem {
  icon: string;
  labelKey: string;
  visibleTo: readonly QuetzalRole[];
  order?: number;
}

export type PermissionMatrix = Record<string, readonly QuetzalRole[]>;

export interface GuestAccessConfig {
  enabled: boolean;
  tokenTTL: number;
  requireDisplayName: boolean;
  maxConcurrentPerSession: number;
}

export interface RateLimitConfig {
  default: { requests: number; windowMs: number };
  perEndpoint?: Record<string, { requests: number; windowMs: number }>;
}

export interface GuestJoinProps {
  tenantId: string;
  moduleSlug: string;
  sessionId: string;
}

export interface EventBus {
  emit<T = unknown>(name: EventName, payload: T): Promise<void>;
  on<T = unknown>(name: EventName | EventName[] | '*.*', handler: (payload: T, meta: { name: EventName }) => Promise<void> | void): void;
}

export interface RootContext {
  logger: Logger;
  config: Readonly<Record<string, string | undefined>>;
  eventBus: EventBus;
  prisma: RootPrismaClient;
}

export interface ModuleContext {
  logger: Logger;
  config: Readonly<Record<string, string | undefined>>;
  eventBus: EventBus;
  tenantId: string;
  prisma: TenantScopedPrismaClient;
  currentUser?: {
    id: string;
    role: QuetzalRole;
    locale: Locale;
  };
}
