'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, connectSocket } from '@quetzal/core/client';
import { Button, Card } from '@quetzal/ui';

interface GreetResponse { msg: string }

export default function HelloPage() {
  const t = useTranslations('common.button');
  const [greetMsg, setGreetMsg] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  async function onGreet() {
    const res = await apiClient().apiFetch('/api/modules/hello/greet');
    if (!res.ok) return;
    const data = (await res.json()) as GreetResponse;
    setGreetMsg(data.msg);
  }

  async function onPing() {
    // Nest answers a @SubscribeMessage returning { event, data } as an event, not as an ack.
    const socket = await connectSocket('ws/hello');
    socket.on('pong', (response: { latencyMs: number }) => {
      setLatency(response.latencyMs);
      socket.disconnect();
    });
    socket.emit('ping', { at: Date.now() });
  }

  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-xl font-semibold">Hello module</h2>
      <div className="flex gap-2">
        <Button onClick={onGreet}>{t('greet')}</Button>
        <Button variant="outline" onClick={onPing}>{t('ping')}</Button>
      </div>
      {greetMsg && <p data-testid="greet-result">{greetMsg}</p>}
      {latency !== null && <p data-testid="ping-result">Latency: {latency}ms</p>}
    </Card>
  );
}
