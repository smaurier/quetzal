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

interface GameHistoryEntry {
  id: string;
  deckName: string | null;
  status: string;
  joinCode: string;
  createdAt: string;
}

const MIN_PLAYABLE = 16;
const PATTERN_KEYS = ['linea', 'esquinas', 'centro', 'llena'] as const;
type PatternKey = (typeof PATTERN_KEYS)[number];

function isPatternKey(value: string): value is PatternKey {
  return (PATTERN_KEYS as readonly string[]).includes(value);
}

export default function DecksPage() {
  const t = useTranslations('module.loto.decks');
  const tGame = useTranslations('module.loto.game');
  const tPattern = useTranslations('module.loto.pattern');
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [games, setGames] = useState<GameHistoryEntry[]>([]);
  const [gameDeckId, setGameDeckId] = useState('');
  const [pattern, setPattern] = useState<PatternKey>('linea');
  const [maxTeams, setMaxTeams] = useState(6);
  const [penalty, setPenalty] = useState(0);

  const reload = useCallback(async () => {
    const res = await apiClient().apiFetch('/api/modules/loto/decks');
    if (!res.ok) return;
    const data = (await res.json()) as { decks: DeckSummary[] };
    setDecks(data.decks);
  }, []);

  const reloadGames = useCallback(async () => {
    const res = await apiClient().apiFetch('/api/modules/loto/games');
    if (!res.ok) return;
    const data = (await res.json()) as { games: GameHistoryEntry[] };
    setGames(data.games);
  }, []);

  useEffect(() => {
    void reload();
    void reloadGames();
  }, [reload, reloadGames]);

  // Ne propose jamais un jeu de moins de seize cartes : l offrir pour le
  // rejeter ensuite serait un mauvais service (revue tâche 38).
  useEffect(() => {
    if (gameDeckId !== '') return;
    const firstPlayable = decks.find((deck) => deck.cardCount >= MIN_PLAYABLE);
    if (firstPlayable !== undefined) setGameDeckId(firstPlayable.id);
  }, [decks, gameDeckId]);

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

  async function createGame(): Promise<void> {
    if (gameDeckId === '') return;
    setError(null);
    const res = await apiClient().apiFetch('/api/modules/loto/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deckId: gameDeckId,
        pattern,
        maxTeams,
        // Pénalité à zéro par défaut : c est ce dont dépend la boucle de
        // réclamation systématique de l E2E invité (tâche 35).
        falseClaimPenaltyDraws: penalty,
      }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? String(res.status));
      return;
    }
    const game = (await res.json()) as { id: string };
    window.location.assign(`/modules/loto/games/${game.id}`);
  }

  function onPatternChange(value: string): void {
    if (isPatternKey(value)) setPattern(value);
  }

  const playableDecks = decks.filter((deck) => deck.cardCount >= MIN_PLAYABLE);

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

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{tGame('create')}</h2>
        <div className="flex flex-wrap items-end gap-2">
          <select
            aria-label={t('title')}
            value={gameDeckId}
            onChange={(event) => setGameDeckId(event.target.value)}
          >
            {playableDecks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
          <select
            aria-label={tGame('pattern')}
            value={pattern}
            onChange={(event) => onPatternChange(event.target.value)}
          >
            {PATTERN_KEYS.map((key) => (
              <option key={key} value={key}>
                {tPattern(key)}
              </option>
            ))}
          </select>
          <Input
            aria-label={tGame('maxTeams')}
            type="number"
            min={1}
            max={20}
            value={maxTeams}
            onChange={(event) => setMaxTeams(Number(event.target.value))}
          />
          <Input
            aria-label={tGame('penalty')}
            type="number"
            min={0}
            max={99}
            value={penalty}
            onChange={(event) => setPenalty(Number(event.target.value))}
          />
          <Button disabled={gameDeckId === ''} onClick={() => void createGame()} data-testid="create-game">
            {tGame('create')}
          </Button>
        </div>
      </section>

      <ul className="space-y-1" data-testid="game-history">
        {games.map((game) => (
          <li key={game.id}>
            <a href={`/modules/loto/games/${game.id}`}>
              {`${game.deckName ?? '—'} · ${game.joinCode} · ${game.status}`}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
