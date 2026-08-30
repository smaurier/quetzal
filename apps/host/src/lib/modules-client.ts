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
      const mod = await import(`@quetzal/module-${slug}`);
      const manifest = mod.manifest as { navItem: ClientNavItem | null };
      entries.push({ slug, navItem: manifest.navItem });
    } catch (e) {
      console.error(`Failed to load module ${slug}`, e);
    }
  }
  return entries;
}
