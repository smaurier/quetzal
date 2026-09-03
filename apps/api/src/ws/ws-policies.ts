import type { NamespacePolicy, PermissionMatrix, QuetzalModuleManifest } from '@quetzal/core';

/** Convention §7: a module gateway lives at `/ws/<slug>`. */
export function moduleSlugFromNamespace(namespace: string): string | null {
  const match = /^\/?ws\/([a-z0-9-]+)$/.exec(namespace);
  return match?.[1] ?? null;
}

export interface WsRegistry {
  /** What the namespace accepts, or null when it belongs to no module. */
  policy(namespace: string): NamespacePolicy | null;
  /** Permission matrix of the module owning the namespace. */
  permissions(namespace: string): PermissionMatrix | null;
}

export function buildWsRegistry(manifests: readonly QuetzalModuleManifest[]): WsRegistry {
  const bySlug = new Map(manifests.map((m) => [m.slug, m]));

  function manifestFor(namespace: string): QuetzalModuleManifest | null {
    const slug = moduleSlugFromNamespace(namespace);
    return slug ? (bySlug.get(slug) ?? null) : null;
  }

  return {
    policy(namespace) {
      const m = manifestFor(namespace);
      return m ? { moduleSlug: m.slug, allowGuests: m.guestAccess?.enabled === true } : null;
    },
    permissions(namespace) {
      return manifestFor(namespace)?.permissions ?? null;
    },
  };
}
