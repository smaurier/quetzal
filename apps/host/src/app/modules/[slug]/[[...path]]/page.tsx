'use client';
import { useEffect, useState, type ComponentType } from 'react';
import { moduleLoaders } from '@/lib/module-loaders.generated';
import { matchModuleRoute } from '@/lib/match-module-route';

interface RouteEntry {
  path: string;
  component: () => Promise<{ default: ComponentType<Readonly<Record<string, string>>> }>;
}

interface ClientManifest {
  uiRoutes: readonly RouteEntry[];
}

function isClientManifest(value: unknown): value is ClientManifest {
  if (typeof value !== 'object' || value === null) return false;
  if (!('uiRoutes' in value)) return false;
  return Array.isArray(value.uiRoutes);
}

type PageState =
  | { status: 'loading' }
  | { status: 'unknown-module' }
  | { status: 'no-route' }
  | { status: 'ready'; Component: ComponentType<Readonly<Record<string, string>>>; params: Readonly<Record<string, string>> };

// Generic route for every module: resolves `slug` through the generated loader map
// (never a template-string import over @quetzal/module-*, see docs/module-contract.md),
// then matches the remaining path segments against the module's declared uiRoutes.
// Unknown slug and no-match are both rendered explicitly — the bug this replaces was a
// silent fallback to uiRoutes[0] with the wrong screen and no error.
export default function ModuleRoutePage({
  params,
}: {
  params: Promise<{ slug: string; path?: string[] }>;
}) {
  const [state, setState] = useState<PageState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { slug, path } = await params;
      const loader = moduleLoaders[slug];
      if (!loader) {
        if (!cancelled) setState({ status: 'unknown-module' });
        return;
      }
      const mod = await loader();
      if (!isClientManifest(mod.clientManifest)) {
        if (!cancelled) setState({ status: 'unknown-module' });
        return;
      }
      const requestedPath = path?.join('/') ?? '';
      const matched = matchModuleRoute(mod.clientManifest.uiRoutes, requestedPath);
      if (!matched) {
        if (!cancelled) setState({ status: 'no-route' });
        return;
      }
      const { default: Component } = await matched.route.component();
      if (!cancelled) setState({ status: 'ready', Component, params: matched.params });
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  if (state.status === 'loading') return null;
  if (state.status === 'unknown-module') return <p role="alert">Module introuvable.</p>;
  if (state.status === 'no-route') return <p role="alert">Page introuvable.</p>;
  const { Component, params: routeParams } = state;
  return <Component {...routeParams} />;
}
