'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { GuestJoinProps } from '@quetzal/core';
import { Button, Card, Input, Label } from '@quetzal/ui';
import { TablaGrid } from './components/tabla-grid.js';
import { CardFace } from './components/card-face.js';
import { teamLabel } from './team-label.js';
import { useGameSocket } from './use-game-socket.js';
import type { GameSnapshot } from '../../application/game-snapshot.use-case.js';

interface TokenResponse {
  token: string;
}

/**
 * Issue #75. `POST /api/guest-token` refuse desormais au-dela du plafond du
 * manifeste, et ce refus arrive sur le telephone d'un eleve.
 *
 * ⛔ Avant, cet ecran faisait `setTokenError(String(res.status))` : un refus
 * aurait affiche « 409 » a un eleve de college. C'est la meme faute que
 * `joinErrorMessage` plus bas avait corrigee pour les erreurs de la passerelle,
 * qui montrait « GameNotRunningError ».
 */
interface RefusalBody {
  // `| undefined` explicite, et non seulement `?` : le dépôt compile avec
  // `exactOptionalPropertyTypes: true`, où `error?: string` veut dire « absente
  // ou chaîne », jamais « présente et undefined ». `lireRefus` rend justement
  // la clé présente à undefined, donc sans ça le type ne tient pas (TS2375).
  error?: string | undefined;
  max?: number | undefined;
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
      setTokenError(await refusalMessage(res, tGuest));
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

  useEffect(() => {
    const cards = snapshot?.tabla?.cards;
    if (cards === undefined) return;
    // Les images d une tabla sont chargées pendant l attente, ce qui étale la
    // charge sur la durée des connexions au lieu de la concentrer au premier
    // tirage, quand trente téléphones demandent tout en même temps. La
    // dépendance porte sur `cards` (stable entre deux marquages) et non sur
    // `tabla` (recréé à chaque marquage), sous peine de tout recharger à
    // chaque coche de case.
    for (const card of cards) {
      if (card.imageId === null) continue;
      const image = new Image();
      image.src = `/api/modules/loto/images/${card.imageId}`;
    }
  }, [snapshot?.tabla?.cards]);

  if (error !== null) return <p role="alert">{joinErrorMessage(error, t)}</p>;
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
      {/* `data-testid` et pas seulement `role="alert"` : apres que l eleve a
          rejoint, Next ajoute son annonceur de route — un `<div role="alert">`
          vide, de 1x1 px — et `getByRole('alert')` en trouve alors DEUX sur
          cette page. Voir le commentaire de `loto-guest.e2e.spec.ts` : un test
          qui visait le role passait quand ce message n apparaissait PAS. */}
      {rejected && !blocked && (
        <p role="alert" data-testid="claim-rejected">
          {t('player.rejected')}
        </p>
      )}
      {game.status === 'finished' && (
        <p role="status" data-testid="finished">
          {outcome(snapshot, tabla.teamId, t)}
        </p>
      )}
    </div>
  );
}

/**
 * Lit le corps d'un refus sans jamais `as` : CLAUDE.md §14 interdit le cast
 * sans typeguard, et ce corps vient du réseau, donc rien ne garantit sa forme.
 * `in` suffit à TypeScript pour narrower, sans cast.
 */
function lireRefus(corps: unknown): RefusalBody {
  if (typeof corps !== 'object' || corps === null) return {};
  return {
    error: 'error' in corps && typeof corps.error === 'string' ? corps.error : undefined,
    max: 'max' in corps && typeof corps.max === 'number' ? corps.max : undefined,
  };
}

/**
 * Traduit le refus de `POST /api/guest-token` en une phrase que l'élève peut
 * lire. Le serveur envoie un CODE et non une phrase, parce qu'il ne connaît pas
 * la langue du téléphone.
 *
 * ⛔ Le repli ne montre JAMAIS le statut ni le code : un nombre nu sur l'écran
 * d'un élève ne lui dit pas quoi faire. Et le corps est lu dans un `try`, parce
 * qu'un refus d'infrastructure — un 502 d'un proxy, l'instance Render endormie —
 * n'a pas de JSON du tout.
 */
async function refusalMessage(
  res: Response,
  t: (key: string, values?: Record<string, string | number>) => string,
): Promise<string> {
  let body: RefusalBody;
  try {
    body = lireRefus(await res.json());
  } catch {
    return t('error.generic');
  }

  switch (body.error) {
    case 'guest_session_full':
      // `max` vient du manifeste, via le corps du refus : l'élève apprend
      // combien de places il y avait, ce qui rend la phrase actionnable.
      return t('error.session_full', { max: body.max ?? 0 });
    case 'guests_not_allowed':
      return t('error.guests_not_allowed');
    default:
      return t('error.generic');
  }
}

/**
 * Trois issues possibles, et l élève doit pouvoir les distinguer : son équipe
 * a gagné, une autre a gagné, ou l animatrice a arrêté la partie. Rendre
 * `game.wonBy` avec un nom vide, comme auparavant, affichait « Victoire de »
 * suivi de rien — sur le dernier écran que voit l élève.
 */
function outcome(
  snapshot: GameSnapshot,
  ownTeamId: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const { wonByTeamId } = snapshot.game;
  if (wonByTeamId === null) return t('game.stopped');
  if (wonByTeamId === ownTeamId) return t('player.youWon');

  const winner = snapshot.teams.find((team) => team.id === wonByTeamId);
  if (winner === undefined) return t('game.stopped');
  return t('game.wonBy', { team: teamLabel(winner.name, t) });
}

/**
 * La passerelle envoie le NOM de la classe d erreur, pas une phrase. L afficher
 * tel quel montrait « GameNotRunningError » à un élève de collège. On traduit
 * les cas connus et on garde un repli honnête pour les autres — jamais le nom
 * technique.
 */
function joinErrorMessage(
  reason: string,
  t: (key: string) => string,
): string {
  switch (reason) {
    case 'GameNotRunningError':
      return t('player.error.notOpen');
    case 'GameNotFoundError':
      return t('player.error.notFound');
    case 'TablaGenerationExhaustedError':
    case 'DeckTooSmallError':
      return t('player.error.deck');
    default:
      return t('player.error.generic');
  }
}
