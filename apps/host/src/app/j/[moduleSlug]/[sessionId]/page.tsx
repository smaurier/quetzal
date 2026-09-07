import { getTranslations } from 'next-intl/server';
import { GuestJoinShell } from '@/components/guest-join-shell';

interface Props {
  params: Promise<{ moduleSlug: string; sessionId: string }>;
  searchParams: Promise<{ tenantId?: string }>;
}

export default async function GuestJoinPage({ params, searchParams }: Props) {
  const { moduleSlug, sessionId } = await params;
  const { tenantId } = await searchParams;
  if (!tenantId) {
    const t = await getTranslations('guest.join');
    return <p role="alert">{t('missing_tenant')}</p>;
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <GuestJoinShell moduleSlug={moduleSlug} sessionId={sessionId} tenantId={tenantId} />
    </main>
  );
}
