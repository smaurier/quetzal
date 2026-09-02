import { moduleLoaders } from './module-loaders.generated';

export interface ClientNavItem {
  icon: string;
  labelKey: string;
  visibleTo: readonly string[];
  order?: number;
}

export interface ClientModuleEntry {
  slug: string;
  navItem: ClientNavItem | null;
}

const SLUGS = (process.env['NEXT_PUBLIC_MODULES'] ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export async function loadClientModuleRegistry(): Promise<ClientModuleEntry[]> {
  const entries: ClientModuleEntry[] = [];
  for (const slug of SLUGS) {
    try {
      const load = moduleLoaders[slug];
      if (!load) throw new Error(`No loader generated for module ${slug}`);
      const mod = await load();
      const manifest = mod.clientManifest as { navItem: ClientNavItem | null };
      entries.push({ slug, navItem: manifest.navItem });
    } catch (e) {
      console.error(`Failed to load module ${slug}`, e);
    }
  }
  return entries;
}
