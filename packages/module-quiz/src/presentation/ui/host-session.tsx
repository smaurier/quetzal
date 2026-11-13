'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient } from '@quetzal/core/client';
import { Button, Card, Input, Label } from '@quetzal/ui';
import { labelDuParticipant } from '../../domain/participant-label.js';
import { Countdown } from './countdown.js';
import {
  actionPrincipale,
  cleErreurDeCommande,
  cleErreurDeSalle,
  apresFermeture,
  doitFermerAZero,
  etatDeSeance,
  fermetureDemandee,
  issueDeFermeture,
  SUIVI_VIDE,
  type ActionPrincipale,
  type CleErreur,
  type SuiviDesFermetures,
} from './pilotage.js';
import type { ParticipantVue } from './quiz-socket-state.js';
import { useQuizSocket } from './use-quiz-socket.js';

/**
 * ⛔ Un `Record<string, string>` et non une forme nommée : le contrat du noyau
 * type tout composant de route `ComponentType<Readonly<Record<string, string>>>`.
 * Le paramètre peut donc manquer au sens du typeur, d'où la lecture indexée.
 */
type Props = Readonly<Record<string, string>>;

type Commande = ActionPrincipale | 'finish';

const CHEMIN: Readonly<Record<Commande, string>> = {
  open: 'open',
  start: 'start',
  next: 'questions/next',
  close: 'questions/close',
  finish: 'finish',
};

async function lireCorps(res: Response): Promise<unknown> {
  try {
    const corps: unknown = await res.json();
    return corps;
  } catch {
    return null;
  }
}

export default function HostSession(props: Props) {
  const sessionId = props['sessionId'];
  const t = useTranslations('module.quiz.session');
  const { session, question, closed, finished, error } = useQuizSocket({ sessionId: sessionId ?? '' });
  const [erreur, setErreur] = useState<CleErreur | null>(null);
  const [enVol, setEnVol] = useState(false);
  // Lu au moment même où une fermeture à zéro se décide, pas à celui du rendu.
  const enVolMaintenant = useRef(false);
  const suiviDesFermetures = useRef<SuiviDesFermetures>(SUIVI_VIDE);
  const [zeroAtteintPour, setZeroAtteintPour] = useState<string | null>(null);
  const [renommage, setRenommage] = useState<Record<string, string>>({});

  /**
   * ⛔ Une commande à la fois. Un double appui sur « suivante » sauterait une
   * question : le serveur ouvrirait N+1 puis N+2.
   */
  async function commande(action: Commande, fermetureAZeroDe?: string): Promise<void> {
    if (sessionId === undefined || enVolMaintenant.current) return;
    enVolMaintenant.current = true;
    setEnVol(true);
    setErreur(null);
    const ouverteAuDepart = question?.sessionQuestionId ?? null;
    let ok = false;
    let cle: CleErreur | null = null;
    try {
      const res = await apiClient().apiFetch(`/api/modules/quiz/sessions/${sessionId}/${CHEMIN[action]}`, {
        method: 'POST',
      });
      ok = res.ok;
      if (!res.ok) cle = cleErreurDeCommande(res.status, await lireCorps(res));
    } catch {
      cle = 'errorGeneric';
    }
    const issue = issueDeFermeture(ok, cle);
    if (fermetureAZeroDe !== undefined) {
      suiviDesFermetures.current = apresFermeture(suiviDesFermetures.current, fermetureAZeroDe, issue);
    } else if (ok && action !== 'open' && action !== 'start' && ouverteAuDepart !== null) {
      // « Suivante », « fermer » et « terminer » ferment la question ouverte.
      // ⛔ La réponse HTTP peut devancer `question-opened` sur la socket : sans
      // cette marque, un zéro tombé pendant la commande fermerait N+1.
      suiviDesFermetures.current = apresFermeture(
        fermetureDemandee(suiviDesFermetures.current, ouverteAuDepart), ouverteAuDepart, 'fermee');
    }
    // Une fermeture à zéro refusée parce que la question l'est déjà (Elda a
    // cliqué juste avant) n'a rien à lui dire.
    if (cle !== null && !(fermetureAZeroDe !== undefined && issue === 'deja-fermee')) setErreur(cle);
    enVolMaintenant.current = false;
    setEnVol(false);
  }

  const questionOuverteId = question?.sessionQuestionId ?? null;

  /**
   * D8 : ce navigateur ferme la question quand son décompte atteint zéro.
   * Réévalué à la fin de chaque commande : une fermeture empêchée par une
   * commande en vol, ou en échec, se retente (`doitFermerAZero` la borne).
   */
  useEffect(() => {
    if (zeroAtteintPour === null) return;
    const permis = doitFermerAZero({
      sessionQuestionId: zeroAtteintPour,
      questionOuverteId,
      suivi: suiviDesFermetures.current,
      commandeEnCours: enVolMaintenant.current,
    });
    if (!permis) return;
    suiviDesFermetures.current = fermetureDemandee(suiviDesFermetures.current, zeroAtteintPour);
    void commande('close', zeroAtteintPour);
    // `commande` change à chaque rendu et n'a pas à relancer l'effet.
  }, [zeroAtteintPour, questionOuverteId, enVol]);

  async function renommer(participant: ParticipantVue): Promise<void> {
    if (sessionId === undefined) return;
    const saisi = renommage[participant.id];
    if (saisi === undefined || saisi.trim() === (participant.name ?? '')) return;
    try {
      const res = await apiClient().apiFetch(
        `/api/modules/quiz/sessions/${sessionId}/participants/${participant.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          // `null` est VOULU : il efface le nom choisi et rend au participant son
          // nom dérivé (issue #29 du loto).
          body: JSON.stringify({ name: saisi.trim() === '' ? null : saisi.trim() }),
        });
      if (!res.ok) setErreur(cleErreurDeCommande(res.status, await lireCorps(res)));
    } catch {
      setErreur('errorGeneric');
    }
  }

  if (sessionId === undefined) return null;
  if (error !== null) return <p role="alert">{t(cleErreurDeSalle(error))}</p>;
  if (session === null) return <p>{t('connecting')}</p>;

  const action = actionPrincipale(session, question, closed);
  const etat = etatDeSeance(session, question, closed);

  return (
    <Card className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        {/* L'état en TEXTE, jamais par la seule couleur (RGAA 3.1). Zone
            polie : annoncé sans interrompre ni déplacer le focus. */}
        <p role="status" className="text-2xl" data-testid="session-status">
          {t(etat.cle, etat.valeurs)}
        </p>
      </header>

      {/* Le code et non une porte ouverte à tous : on ne rejoint qu'une séance
          `ouverte` (spec § 5.4), l'afficher avant enverrait la classe sur un
          refus. En grand et en chasse fixe : il est lu de loin, projeté. */}
      {session.status === 'ouverte' && (
        <p className="text-center font-mono text-6xl font-bold tracking-widest" data-testid="join-code">
          {t('joinCode', { code: session.joinCode })}
        </p>
      )}

      <div role="group" aria-label={t('actions')} className="flex flex-wrap gap-4">
        {action !== null && (
          // ⛔ UN SEUL élément pour l'action principale, dont le libellé change :
          // le focus clavier reste dessus d'une étape à l'autre, au lieu de
          // tomber sur la page chaque fois qu'un bouton disparaît. `aria-disabled`
          // et non `disabled` pour la même raison : un bouton désactivé perd le
          // focus. Le double appui est bloqué dans `commande`.
          <Button
            key="action-principale"
            size="lg"
            className="h-14 px-8 text-xl"
            aria-disabled={enVol}
            onClick={() => void commande(action)}
            data-testid={action}
          >
            {t(action)}
          </Button>
        )}
        {session.status !== 'terminee' && (
          <Button
            size="lg"
            variant="outline"
            className="h-14 px-8 text-xl"
            aria-disabled={enVol}
            onClick={() => void commande('finish')}
            data-testid="finish"
          >
            {t('finish')}
          </Button>
        )}
      </div>

      {/* `data-testid` en plus du rôle : Next pose son propre `role="alert"`
          d'annonce de route, et `getByRole('alert')` en trouverait deux. */}
      {erreur !== null && (
        <p role="alert" className="text-xl font-semibold text-destructive" data-testid="command-error">
          {t(erreur)}
        </p>
      )}

      {question !== null && (
        <section aria-labelledby="quiz-question-courante" className="flex flex-col gap-4">
          <h2 id="quiz-question-courante" className="text-2xl font-semibold">
            {t('questionHeading', { rank: question.rank, total: session.questionCount })}
          </h2>
          <Countdown
            key={question.sessionQuestionId}
            echeanceMs={question.echeanceMs}
            onZero={() => setZeroAtteintPour(question.sessionQuestionId)}
          />
          <p className="text-4xl">{question.prompt}</p>
          {question.imageId !== null && (
            <img
              src={`/api/modules/quiz/images/${question.imageId}`}
              alt={question.imageAlt ?? ''}
              className="max-h-96 w-auto self-center rounded"
            />
          )}
          {question.options.length > 0 && (
            <>
              <h3 className="text-xl font-semibold">{t('optionsHeading')}</h3>
              {/* ⛔ AUCUNE marque de la bonne réponse : cet écran est projeté.
                  La charge de la salle ne la porte d'ailleurs pas. */}
              <ol className="grid gap-3 md:grid-cols-2">
                {question.options.map((option) => (
                  <li key={option.id} className="flex items-center gap-3 rounded-lg border px-4 py-3 text-2xl">
                    {option.imageId !== null && (
                      <img
                        src={`/api/modules/quiz/images/${option.imageId}`}
                        alt={option.imageAlt ?? ''}
                        className="h-24 w-auto rounded"
                      />
                    )}
                    {option.label}
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}

      {closed !== null && (
        <p role="status" className="text-2xl" data-testid="question-result">
          {t('reportQuestion', { rank: closed.rank, correct: closed.correctCount, answered: closed.answerCount })}
        </p>
      )}

      {finished !== null && (
        <section aria-labelledby="quiz-podium" className="flex flex-col gap-2">
          <h2 id="quiz-podium" className="text-2xl font-semibold">{t('podium')}</h2>
          <ol className="flex flex-col gap-1 text-2xl" data-testid="podium">
            {finished.classement.map((ligne) => (
              <li key={ligne.participantId}>{t('podiumLine', { label: ligne.label, score: ligne.score })}</li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="quiz-participants" className="flex flex-col gap-3">
        <h2 id="quiz-participants" className="text-2xl font-semibold">{t('participantsHeading')}</h2>
        <p className="text-xl" data-testid="participant-count">
          {t('participants', { count: session.participants.length })}
        </p>
        {/* Le diffuseur masque les scores pendant une question ouverte (un score
            qui bouge dit sur qui copier) : le dire, sinon ils semblent figés. */}
        {question !== null && <p className="text-muted-foreground">{t('scoresFrozen')}</p>}
        {session.participants.length === 0 ? (
          <p>{t('waiting')}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2" data-testid="participants">
            {session.participants.map((participant) => (
              <li key={participant.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
                <span className="text-xl font-semibold">{labelDuParticipant(participant)}</span>
                <span className="text-xl" data-testid={`score-${participant.id}`}>
                  {t('score', { score: participant.score })}
                </span>
                {session.status !== 'terminee' && (
                  <span className="flex w-full flex-col gap-1">
                    {/* Le NUMÉRO dans chaque libellé : « Renommer » répété six
                        fois ne dit pas lequel à un lecteur d'écran. */}
                    <Label htmlFor={`rename-${participant.id}`}>
                      {t('rename', { index: participant.participantIndex })}
                    </Label>
                    <Input
                      id={`rename-${participant.id}`}
                      maxLength={40}
                      value={renommage[participant.id] ?? participant.name ?? ''}
                      onChange={(event) =>
                        setRenommage((courant) => ({ ...courant, [participant.id]: event.target.value }))
                      }
                      onBlur={() => void renommer(participant)}
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}
