'use client';
import { useEffect, useState, type ComponentType } from 'react';
import { moduleLoaders } from '@/lib/module-loaders.generated';

interface Props {
  moduleSlug: string;
  sessionId: string;
  tenantId: string;
}

interface GuestJoinManifest {
  guestJoinComponent?: () => Promise<{ default: ComponentType<Props> }>;
}

export function GuestJoinShell({ moduleSlug, sessionId, tenantId }: Props) {
  const [Component, setComponent] = useState<ComponentType<Props> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const loader = moduleLoaders[moduleSlug];
        if (!loader) { setError('Unknown module'); return; }
        const mod = await loader();
        const load = (mod.clientManifest as GuestJoinManifest | undefined)?.guestJoinComponent;
        if (!load) { setError('Module does not support guest join'); return; }
        const { default: C } = await load();
        setComponent(() => C);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [moduleSlug]);

  if (error) return <p role="alert">{error}</p>;
  if (!Component) return <p>Loading...</p>;
  return <Component moduleSlug={moduleSlug} sessionId={sessionId} tenantId={tenantId} />;
}
