import { getTranslations } from 'next-intl/server';

export default async function DashboardPage() {
  const t = await getTranslations('nav');
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t('dashboard')}</h1>
      <p className="mt-2 text-muted-foreground">
        Modules enabled for your tenant appear in the sidebar.
      </p>
    </div>
  );
}
