'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient } from '@quetzal/core/client';
import { Button, Card, Input } from '@quetzal/ui';

interface DeckCard {
  id: string;
  rank: number;
  label: string;
  imageId: string | null;
}

interface Deck {
  id: string;
  name: string;
  isTemplate: boolean;
  cardCount: number;
  cards: DeckCard[];
}

const MIN_PLAYABLE = 16;

// Le composant de route ne reçoit que les paramètres capturés par le
// manifeste (`decks/:deckId`), typés Readonly<Record<string, string>> par
// la plateforme (voir apps/host/src/app/modules/[slug]/[[...path]]/page.tsx) :
// pas de champ `deckId` garanti au sens du typeur, d où la lecture indexée
// ci-dessous — même pattern que animator-page.tsx pour `gameId`.
type Props = Readonly<Record<string, string>>;

export default function DeckEditor(props: Props) {
  const deckId = props['deckId'];
  const t = useTranslations('module.loto.decks');
  const [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (deckId === undefined) return;
    const res = await apiClient().apiFetch(`/api/modules/loto/decks/${deckId}`);
    if (!res.ok) return;
    setDeck((await res.json()) as Deck);
  }, [deckId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function patch(body: unknown): Promise<void> {
    if (deckId === undefined) return;
    setError(null);
    const res = await apiClient().apiFetch(`/api/modules/loto/decks/${deckId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = (await res.json()) as { error?: string };
      setError(payload.error ?? String(res.status));
      return;
    }
    await reload();
  }

  async function upload(rank: number, file: File): Promise<void> {
    if (deckId === undefined) return;
    const { resizeToDataUrl } = await import('./resize-image.js');
    const payload = await resizeToDataUrl(file);
    const res = await apiClient().apiFetch(`/api/modules/loto/decks/${deckId}/cards/${String(rank)}/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) await reload();
  }

  if (deckId === undefined) return null;
  if (deck === null) return null;

  return (
    <Card className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Input
          defaultValue={deck.name}
          maxLength={120}
          onBlur={(event) => void patch({ name: event.target.value })}
        />
        <span className={deck.cards.length < MIN_PLAYABLE ? 'text-destructive' : undefined}>
          {t('cardCount', { count: deck.cards.length })}
          {deck.cards.length < MIN_PLAYABLE ? ` · ${t('tooSmall')}` : ''}
        </span>
      </div>

      {error !== null && <p role="alert">{error === 'deck_locked_error' ? t('locked') : error}</p>}

      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="deck-cards">
        {deck.cards.map((card) => (
          <li key={card.id} className="space-y-2 rounded-lg border p-2">
            <span className="text-xs text-muted-foreground">{card.rank}</span>
            <Input
              defaultValue={card.label}
              maxLength={80}
              onBlur={(event) => void patch({ card: { rank: card.rank, label: event.target.value } })}
            />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) void upload(card.rank, file);
              }}
            />
          </li>
        ))}
      </ol>

      <Button onClick={() => void patch({ card: { rank: deck.cards.length + 1, label: '' } })}>
        {t('addCard')}
      </Button>
    </Card>
  );
}
