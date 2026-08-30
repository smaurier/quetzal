import Link from 'next/link';
import type { Route } from 'next';
import { loadClientModuleRegistry } from '@/lib/modules-client';
import { getTranslations } from 'next-intl/server';

export async function Sidebar() {
  const modules = await loadClientModuleRegistry();
  const t = await getTranslations();
  const items = modules
    .filter((m): m is typeof m & { navItem: NonNullable<typeof m.navItem> } => m.navItem !== null)
    .sort((a, b) => (a.navItem.order ?? 100) - (b.navItem.order ?? 100));

  return (
    <aside className="w-56 border-r bg-muted/30 p-4">
      <div className="text-lg font-semibold mb-6">Quetzal</div>
      <nav className="space-y-1">
        {items.map((m) => (
          <Link
            key={m.slug}
            href={`/modules/${m.slug}` as Route}
            className="block rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            {t(m.navItem.labelKey)}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
