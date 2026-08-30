'use client';
import { useEffect, useState, type ComponentType } from 'react';

interface Props {
  moduleSlug: string;
  sessionId: string;
  tenantId: string;
}

export function GuestJoinShell({ moduleSlug, sessionId, tenantId }: Props) {
  const [Component, setComponent] = useState<ComponentType<Props> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const mod = await import(`@quetzal/module-${moduleSlug}`);
        const load = mod.manifest?.guestJoinComponent;
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
