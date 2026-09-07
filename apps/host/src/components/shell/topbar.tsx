'use client';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@quetzal/ui';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeSwitcher } from './theme-switcher';
import type { ThemePreference } from '@/lib/theme';

export function Topbar({ theme }: { theme: ThemePreference }) {
  const router = useRouter();
  const t = useTranslations('nav');

  async function logout() {
    await authClient.signOut();
    router.push('/login');
  }

  return (
    <header className="flex h-14 items-center justify-end gap-2 border-b px-4">
      <ThemeSwitcher current={theme} />
      <LocaleSwitcher />
      <Button variant="outline" size="sm" onClick={logout}>
        {t('logout')}
      </Button>
    </header>
  );
}
