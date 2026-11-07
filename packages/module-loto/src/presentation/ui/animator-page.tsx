'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toDataURL } from 'qrcode';
import { apiClient, getCurrentTenantId } from '@quetzal/core/client';
import { Button, Card } from '@quetzal/ui';
import { CardFace } from './components/card-face.js';
import { DrawRibbon } from './components/draw-ribbon.js';
import type { TeamName } from '../../domain/team-name.js';
import { teamLabel } from './team-label.js';
import { useGameSocket } from './use-game-socket.js';

// Le composant de route ne reçoit que les paramètres capturés par le manifeste
// (`games/:gameId`), typés Readonly<Record<string, string>> par la plateforme
// (voir apps/host/src/app/modules/[slug]/[[...path]]/page.tsx) : pas de champ
// `gameId` garanti au sens du typeur, d où la lecture indexée ci-dessous et le
// repli défensif, structurellement inatteignable puisque le manifeste ne
// déclare que la route `games/:gameId`. L origine du lien de rejoint vient de
// window.location.origin, pas d une prop qui n existe pas côté hôte.
type Props = Readonly<Record<string, string>>;

export default function AnimatorPage(props: Props) {
  const t = useTranslations('module.loto');
  const tPattern = useTranslations('module.loto.pattern');
  const gameId = props['gameId'];
  const { snapshot, error } = useGameSocket({ gameId: gameId ?? '' });
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  // Aucun QR ni adresse tant que le locataire n est pas connu : l adresse
  // d entrée invité exige tenantId en query (apps/host/src/app/j/…), sans
  // quoi elle rend une page morte (spec tâche 34, étape 4 bis).
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void getCurrentTenantId().then((id) => {
      if (!cancelled) setTenantId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const joinUrl =
    tenantId === undefined || tenantId === null || snapshot === null
      ? null
      : `${origin}/j/loto/${snapshot.game.id}?tenantId=${tenantId}` +
        // Le lien transporte la langue gelee sur la partie : c est lui que les
        // telephones suivent, et le QR en decoule sans changer de forme.
        (snapshot.game.guestLocale === null
          ? ''
          : `&lang=${snapshot.game.guestLocale}`);

  // Générée à côté (et non à la place) du code : le QR sert la salle qui
  // regarde un projecteur, le code sert l élève dont la caméra refuse de
  // coopérer. Taille et marge grandes exprès : lue depuis le fond d une
  // classe, une zone de silence trop fine rend le flashage peu fiable.
  const [joinQrDataUrl, setJoinQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (joinUrl === null) {
      setJoinQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void toDataURL(joinUrl, { margin: 4, width: 512 }).then((dataUrl) => {
      if (!cancelled) setJoinQrDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  if (gameId === undefined) return null;
  if (error !== null) return <p role="alert">{error}</p>;
  if (snapshot === null) return <p>{t('game.waiting')}</p>;

  const { game, teams, draws } = snapshot;
  const lastDraw = draws[draws.length - 1];

  async function post(path: string): Promise<void> {
    await apiClient().apiFetch(`/api/modules/loto/games/${gameId}/${path}`, { method: 'POST' });
  }

  /**
   * Issue #29. `null` efface le nom choisi et rend l équipe à son nom dérivé :
   * c est le même geste que renommer, avec une valeur de moins. L écran ne
   * remet pas l instantané à jour lui-même — la socket renvoie `team-renamed`
   * et c est elle qui fait foi, comme pour tout le reste de cet écran.
   */
  async function renommer(teamId: string, name: string | null): Promise<void> {
    await apiClient().apiFetch(`/api/modules/loto/games/${gameId}/teams/${teamId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  if (game.status === 'draft' || game.status === 'open') {
    return (
      <Card className="p-8 space-y-8">
        {/*
          Le code et le QR n apparaissent qu une fois la salle ouverte. En
          `draft` on ne peut pas encore rejoindre — canJoin n accepte que
          `open`, et le jeu de cartes n est figé qu à l ouverture — donc
          afficher une porte d entrée qui refuse tout le monde n avait qu un
          effet : envoyer les élèves droit sur une erreur.
        */}
        {game.status === 'draft' ? (
          <p className="text-center text-2xl text-muted-foreground" data-testid="not-open-yet">
            {t('game.notOpenYet')}
          </p>
        ) : (
        <div className="text-center">
          <p className="text-2xl">{t('game.joinCode')}</p>
          <p className="text-8xl font-bold tracking-widest" data-testid="join-code">
            {game.joinCode}
          </p>
          {joinUrl !== null && (
            <p className="mt-4 break-all text-sm text-muted-foreground" data-testid="join-url">
              {joinUrl}
            </p>
          )}
          {joinQrDataUrl !== null && (
            <img
              src={joinQrDataUrl}
              // Vide et non descriptif : l URL exacte qu il encode est déjà
              // affichée juste au-dessus et lisible par tout lecteur d écran,
              // donc le QR n apporte rien de plus à qui ne peut pas viser une
              // caméra dessus. alt="" le déclare décoratif pour ne pas faire
              // annoncer deux fois la même adresse.
              alt=""
              width={512}
              height={512}
              className="mx-auto mt-4 h-64 w-64"
              data-testid="join-qr"
            />
          )}
        </div>
        )}

        <ul className="flex flex-wrap gap-3" data-testid="teams">
          {teams.map((team) => (
            <li key={team.id} className="rounded-lg border px-4 py-2 text-xl">
              <TeamNameField
                label={teamLabel(team.name, t)}
                chosen={team.name.kind === 'custom' ? team.name.label : ''}
                memberCount={team.memberCount}
                onRename={(name) => void renommer(team.id, name)}
                t={t}
              />
            </li>
          ))}
        </ul>

        <div className="flex gap-3">
          {game.status === 'draft' ? (
            <Button size="lg" onClick={() => void post('open')}>
              {t('game.open')}
            </Button>
          ) : (
            <Button size="lg" onClick={() => void post('draw')} data-testid="draw">
              {t('game.draw')}
            </Button>
          )}
          <Button size="lg" variant="outline" onClick={() => void post('finish')}>
            {t('game.finish')}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-8 space-y-6">
      {game.patternTotal > 1 && (
        <p className="text-center text-lg text-muted-foreground" data-testid="pattern-progress">
          {t('game.patternProgress', {
            position: game.patternPosition,
            total: game.patternTotal,
            pattern: tPattern(game.pattern),
          })}
        </p>
      )}

      {lastDraw !== undefined && (
        <div className="text-center" data-testid="last-draw">
          <CardFace label={lastDraw.label} imageId={null} size="xl" />
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button size="lg" disabled={game.status === 'finished'} onClick={() => void post('draw')} data-testid="draw">
          {t('game.draw')}
        </Button>
        <p className="text-xl">{t('game.remaining', { count: game.remainingCardCount })}</p>
        <Button size="lg" variant="outline" onClick={() => void post('finish')}>
          {t('game.finish')}
        </Button>
      </div>

      <DrawRibbon draws={draws} />

      {game.status === 'finished' && (
        <p className="text-4xl font-bold text-center" role="status" data-testid="winner">
          {game.wonByTeamId === null
            ? t('game.stopped')
            : t('game.wonBy', {
                team: nameOf(teams, game.wonByTeamId, t),
              })}
        </p>
      )}
    </Card>
  );
}

function nameOf(
  teams: readonly { id: string; name: TeamName }[],
  teamId: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const team = teams.find((candidate) => candidate.id === teamId);
  if (team === undefined) return '';
  return teamLabel(team.name, t);
}

/**
 * Le champ de renommage d'une équipe (issue #29).
 *
 * Le libellé reste affiché tant qu'on n'édite pas : cet écran est projeté au
 * tableau, et une rangée de champs de saisie permanents y serait illisible. Le
 * bouton porte le nom de l'équipe dans son libellé accessible — `team.rename`
 * attend `{name}` — parce que « Renommer » répété six fois ne dit à un lecteur
 * d'écran laquelle il renomme.
 */
function TeamNameField(props: {
  label: string;
  chosen: string;
  memberCount: number;
  onRename: (name: string | null) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const { label, chosen, memberCount, onRename, t } = props;
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState(chosen);

  if (!edition) {
    return (
      <span className="flex items-center gap-2">
        <span>
          {label}
          {memberCount > 1 ? ` (${String(memberCount)})` : ''}
        </span>
        <Button
          size="sm"
          variant="ghost"
          aria-label={t('team.rename', { name: label })}
          onClick={() => {
            setValeur(chosen);
            setEdition(true);
          }}
        >
          {t('team.renameAction')}
        </Button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <input
        className="rounded border px-2 py-1 text-lg"
        aria-label={t('team.renamePlaceholder')}
        value={valeur}
        maxLength={40}
        onChange={(event) => setValeur(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onRename(valeur);
            setEdition(false);
          }
          if (event.key === 'Escape') setEdition(false);
        }}
      />
      <Button
        size="sm"
        onClick={() => {
          onRename(valeur);
          setEdition(false);
        }}
      >
        {t('team.renameSave')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          // `null` et non la chaîne vide : c est la valeur que la route attend
          // pour effacer, et le domaine traiterait de toute façon un nom blanc
          // comme une absence. Dire `null` explicitement garde les deux
          // couches d accord.
          onRename(null);
          setEdition(false);
        }}
      >
        {t('team.renameClear')}
      </Button>
    </span>
  );
}
