'use client';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { THEME_PREFERENCES, type ThemePreference } from '@/lib/theme';

export function ThemeSwitcher({ current }: { current: ThemePreference }) {
  const router = useRouter();
  const t = useTranslations('common.theme');

  async function change(theme: string) {
    await fetch('/api/user/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    });
    // La classe est posée par le serveur : c'est le rafraîchissement qui
    // applique le nouveau mode, pas une manipulation du DOM côté client.
    router.refresh();
  }

  return (
    <select
      defaultValue={current}
      onChange={(e) => change(e.target.value)}
      className="rounded-md border bg-background px-2 py-1 text-sm"
      aria-label={t('label')}
    >
      {THEME_PREFERENCES.map((preference) => (
        <option key={preference} value={preference}>
          {t(preference)}
        </option>
      ))}
    </select>
  );
}
