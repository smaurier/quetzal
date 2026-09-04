'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient } from '@quetzal/core/client';
import { Button, Card, Input } from '@quetzal/ui';

interface DeckSummary {
  id: string;
  name: string;
  isTemplate: boolean;
  cardCount: number;
}

const MIN_PLAYABLE = 16;

export default function DecksPage() {
  const t = useTranslations('module.loto.decks');
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await apiClient().apiFetch('/api/modules/loto/decks');
    if (!res.ok) return;
    const data = (await res.json()) as { decks: DeckSummary[] };
    setDecks(data.decks);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function send(path: string, init: RequestInit): Promise<void> {
    setError(null);
    const res = await apiClient().apiFetch(path, init);
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? String(res.status));
      return;
    }
    await reload();
  }

  async function duplicate(deck: DeckSummary): Promise<void> {
    await send('/api/modules/loto/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `${deck.name} (copie)`, duplicateOf: deck.id }),
    });
  }

  async function createBlank(): Promise<void> {
    if (newName.trim() === '') return;
    await send('/api/modules/loto/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    setNewName('');
  }

  async function remove(deck: DeckSummary): Promise<void> {
    // La suppression emporte l historique des parties liées. L avertissement
    // est explicite parce que l action est définitive, cascade comprise.
    if (!window.confirm(t('deleteWarning'))) return;
    await send(`/api/modules/loto/decks/${deck.id}`, { method: 'DELETE' });
  }

  return (
    <Card className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {error !== null && <p role="alert">{error === 'deck_locked_error' ? t('locked') : error}</p>}

      {decks.length === 0 && <p>{t('empty')}</p>}

      <ul className="space-y-2" data-testid="decks">
        {decks.map((deck) => (
          <li key={deck.id} className="flex items-center gap-3 rounded-lg border p-3">
            <span className="flex-1 font-medium">{deck.name}</span>
            <span className={deck.cardCount < MIN_PLAYABLE ? 'text-destructive' : undefined}>
              {t('cardCount', { count: deck.cardCount })}
              {deck.cardCount < MIN_PLAYABLE ? ` · ${t('tooSmall')}` : ''}
            </span>
            <Button variant="outline" onClick={() => void duplicate(deck)}>{t('duplicate')}</Button>
            {!deck.isTemplate && (
              <Button variant="destructive" onClick={() => void remove(deck)}>{t('delete')}</Button>
            )}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Input value={newName} maxLength={120} onChange={(event) => setNewName(event.target.value)} />
        <Button onClick={() => void createBlank()}>{t('createBlank')}</Button>
      </div>
    </Card>
  );
}
