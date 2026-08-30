'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { io, type Socket } from 'socket.io-client';
import { Button, Card, Input, Label } from '@quetzal/ui';

interface Props {
  tenantId: string;
  moduleSlug: string;
  sessionId: string;
}

interface TokenResponse { token: string }

export default function GuestJoin({ tenantId, moduleSlug, sessionId }: Props) {
  const t = useTranslations('guest.join');
  const [displayName, setDisplayName] = useState('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/guest-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, moduleSlug, sessionId, displayName }),
    });
    if (!res.ok) { setError(`Join failed (${res.status})`); return; }
    const { token } = (await res.json()) as TokenResponse;
    const socket: Socket = io('/ws/hello', { auth: { guestToken: token }, transports: ['websocket'] });
    socket.on('connect', () => setConnected(true));
  }

  if (connected) {
    return <p data-testid="connected">Connected as {displayName}</p>;
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <h1 className="text-xl font-semibold mb-4">{t('title')}</h1>
      <form onSubmit={onJoin} className="space-y-4">
        <div>
          <Label htmlFor="displayName">{t('display_name')}</Label>
          <Input id="displayName" required maxLength={32} value={displayName} onChange={e => setDisplayName(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full">Join</Button>
      </form>
    </Card>
  );
}
