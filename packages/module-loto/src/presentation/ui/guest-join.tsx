'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { GuestJoinProps } from '@quetzal/core';
import { Button, Card, Input, Label } from '@quetzal/ui';
import { TablaGrid } from './components/tabla-grid.js';
import { CardFace } from './components/card-face.js';
import { useGameSocket } from './use-game-socket.js';

interface TokenResponse {
  token: string;
}

export default function GuestJoin({ tenantId, moduleSlug, sessionId }: GuestJoinProps) {
  const t = useTranslations('module.loto');
  const tGuest = useTranslations('guest.join');
  const tButton = useTranslations('common.button');
  const [displayName, setDisplayName] = useState('');
  const [guestToken, setGuestToken] = useState<string | undefined>(undefined);
  const [tokenError, setTokenError] = useState<string | null>(null);

  async function onJoin(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setTokenError(null);
    const res = await fetch('/api/guest-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, moduleSlug, sessionId, displayName }),
    });
    if (!res.ok) {
      setTokenError(String(res.status));
      return;
    }
    const { token } = (await res.json()) as TokenResponse;
    setGuestToken(token);
  }

  if (guestToken === undefined) {
    return (
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-4 text-xl font-semibold">{t('nav.title')}</h1>
        <form onSubmit={(event) => void onJoin(event)} className="space-y-4">
          <div>
            <Label htmlFor="displayName">{tGuest('display_name')}</Label>
            <Input
              id="displayName"
              required
              maxLength={32}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          {tokenError !== null && <p role="alert">{tokenError}</p>}
          <Button type="submit" className="w-full">
            {tButton('join')}
          </Button>
        </form>
      </Card>
    );
  }

  return <PlayerBoard gameId={sessionId} guestToken={guestToken} />;
}

function PlayerBoard({ gameId, guestToken }: { gameId: string; guestToken: string }) {
  const t = useTranslations('module.loto');
  const { snapshot, error, socket } = useGameSocket({ gameId, guestToken });
  const [rejected, setRejected] = useState(false);

  if (error !== null) return <p role="alert">{error}</p>;
  if (snapshot === null || snapshot.tabla === null) return <p>{t('player.waiting')}</p>;

  const { game, draws, tabla } = snapshot;
  const lastDraw = draws[draws.length - 1];
  const blocked = tabla.blockedUntilDraw > game.lastDrawOrder;

  function toggle(cardId: string, marked: boolean): void {
    socket?.emit('mark', { cardId, marked });
  }

  function claim(): void {
    setRejected(false);
    socket?.emit('claim');
    // La réponse arrive par l événement claim-result, jamais par un accusé :
    // Nest transforme un retour {event, data} en événement.
    socket?.once('claim-result', (payload: { valid: boolean }) => setRejected(!payload.valid));
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-3 p-3">
      {lastDraw !== undefined && <CardFace label={lastDraw.label} imageId={null} size="lg" />}

      <TablaGrid
        cards={tabla.cards}
        markedCardIds={tabla.markedCardIds}
        onToggle={toggle}
        disabled={game.status === 'finished'}
      />

      <Button
        size="lg"
        className="h-16 text-2xl"
        disabled={blocked || game.status !== 'running'}
        onClick={claim}
        data-testid="claim"
      >
        {t('player.claim')}
      </Button>

      {blocked && <p role="status">{t('player.blocked', { draw: tabla.blockedUntilDraw })}</p>}
      {rejected && !blocked && <p role="alert">{t('player.rejected')}</p>}
      {game.status === 'finished' && (
        <p role="status" data-testid="finished">
          {game.wonByTeamId === tabla.teamId ? t('game.wonBy', { team: '' }) : t('game.stopped')}
        </p>
      )}
    </div>
  );
}
