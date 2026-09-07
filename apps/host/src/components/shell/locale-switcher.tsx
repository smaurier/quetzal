'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('common.locale');

  async function change(newLocale: string) {
    await fetch('/api/user/locale', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: newLocale }),
    });
    router.refresh();
  }

  return (
    <select
      value={locale}
      onChange={e => change(e.target.value)}
      className="rounded-md border bg-background px-2 py-1 text-sm"
      aria-label={t('label')}
    >
      <option value="fr">{t('fr')}</option>
      <option value="en">{t('en')}</option>
      <option value="es">{t('es')}</option>
    </select>
  );
}
