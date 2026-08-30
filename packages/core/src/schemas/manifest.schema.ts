import { z } from 'zod';

const localeMap = z.object({
  fr: z.string().min(1),
  en: z.string().min(1),
  es: z.string().min(1),
});

const roles = z.enum(['owner', 'admin', 'creator', 'learner', 'guest']);
const semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'must be semver X.Y.Z');
const slug = z.string().regex(/^[a-z][a-z0-9-]{2,31}$/, 'kebab-case, 3-32 chars, start with letter');

export const manifestSchema = z.object({
  slug,
  name: localeMap,
  description: localeMap,
  version: semver,
  contractVersion: semver,
  enabledByDefault: z.boolean(),
  // Type<INestModule> — class reference; runtime introspection impossible, kept as any at the schema boundary.
  apiModule: z.any(),
  eventsPublished: z.array(z.object({
    name: z.string().regex(/^[a-z]+(\.[a-z]+){1,2}$/),
    typeRef: z.string(),
  })),
  eventsSubscribed: z.array(z.any()).optional(),
  uiRoutes: z.array(z.object({
    path: z.string(),
    component: z.function(),
    requiredRoles: z.array(roles),
    layout: z.enum(['shell', 'full']),
  })),
  navItem: z.object({
    icon: z.string(),
    labelKey: z.string(),
    visibleTo: z.array(roles),
    order: z.number().optional(),
  }).nullable(),
  guestJoinComponent: z.function().optional(),
  permissions: z.record(z.string(), z.array(roles)),
  guestAccess: z.object({
    enabled: z.boolean(),
    tokenTTL: z.number().positive(),
    requireDisplayName: z.boolean(),
    maxConcurrentPerSession: z.number().positive(),
  }).optional(),
  rateLimits: z.object({
    default: z.object({ requests: z.number(), windowMs: z.number() }),
    perEndpoint: z.record(z.string(), z.object({ requests: z.number(), windowMs: z.number() })).optional(),
  }).optional(),
  prismaModels: z.string().optional(),
  configSchema: z.any().optional(),
  onBoot: z.function().optional(),
  onInstall: z.function().optional(),
  onEnable: z.function().optional(),
  onDisable: z.function().optional(),
});
