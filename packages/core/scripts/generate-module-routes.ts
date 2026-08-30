#!/usr/bin/env tsx
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const HOST_ROUTES = resolve(ROOT, 'apps/host/src/app/modules');
const SLUGS = (process.env['MODULES'] ?? process.env['NEXT_PUBLIC_MODULES'] ?? '').split(',').map(s => s.trim()).filter(Boolean);

async function main() {
  await rm(HOST_ROUTES, { recursive: true, force: true });
  await mkdir(HOST_ROUTES, { recursive: true });

  for (const slug of SLUGS) {
    const moduleDir = resolve(HOST_ROUTES, slug);
    await mkdir(resolve(moduleDir, '[[...path]]'), { recursive: true });
    const pageContent = `'use client';
import { useEffect, useState, type ComponentType } from 'react';

interface Manifest {
  uiRoutes: Array<{ path: string; component: () => Promise<{ default: ComponentType }> }>;
}

export default function ModuleRoutePage({ params }: { params: Promise<{ path?: string[] }> }) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  useEffect(() => {
    (async () => {
      const mod = await import('@quetzal/module-${slug}');
      const manifest = mod.manifest as Manifest;
      const p = (await params).path?.join('/') ?? '';
      const route = manifest.uiRoutes.find(r => r.path === p) ?? manifest.uiRoutes[0];
      if (!route) return;
      const { default: C } = await route.component();
      setComponent(() => C);
    })();
  }, [params]);
  if (!Component) return null;
  return <Component />;
}
`;
    await writeFile(resolve(moduleDir, '[[...path]]', 'page.tsx'), pageContent, 'utf8');
    console.log(`[generate-module-routes] wrote apps/host/src/app/modules/${slug}/[[...path]]/page.tsx`);
  }

  if (SLUGS.length === 0) {
    console.log('[generate-module-routes] no MODULES env — cleared routes dir, wrote nothing');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
