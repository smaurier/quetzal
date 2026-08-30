import { GuestJoinShell } from '@/components/guest-join-shell';

interface Props {
  params: Promise<{ moduleSlug: string; sessionId: string }>;
  searchParams: Promise<{ tenantId?: string }>;
}

export default async function GuestJoinPage({ params, searchParams }: Props) {
  const { moduleSlug, sessionId } = await params;
  const { tenantId } = await searchParams;
  if (!tenantId) return <p role="alert">Missing tenantId</p>;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <GuestJoinShell moduleSlug={moduleSlug} sessionId={sessionId} tenantId={tenantId} />
    </main>
  );
}
