# Module Quiz, plan 2, fin : la séance (tâches 17 à 20)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Fin de** [`2026-11-08-module-quiz-seance-6.md`](./2026-11-08-module-quiz-seance-6.md). Garde-fous du premier fichier toujours en vigueur.

---

## Task 17 : l'écran élève, et le plancher d'accessibilité en entier

C'est la tâche où la spec § 8 se paie. Les cinq points y sont traités, chacun
avec le critère qu'il satisfait.

**Files:**
- Create: `packages/module-quiz/src/presentation/ui/guest-play.tsx`
- Create: `packages/module-quiz/src/presentation/ui/countdown.tsx`
- Test: `packages/module-quiz/src/presentation/ui/countdown.spec.ts`
- Modify: `packages/module-quiz/src/i18n/{fr,en,es}.json`

- [ ] **Step 1 : écrire le test du décompte, qui échoue**

Le minuteur a une part **pure** et testable : à quels jalons annonce-t-on ?

`packages/module-quiz/src/presentation/ui/countdown.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { JALONS_SECONDES, jalonAtteint, secondesRestantes } from './countdown.js';

/**
 * Spec §8 point 2 : « Minuteur annonce, pas seulement affiche ». Un decompte
 * uniquement visuel est INVISIBLE a un lecteur d'ecran, et le contenu d'un
 * `role="status"` qui change chaque seconde est pire que rien : il noie
 * l'utilisateur sous trente annonces.
 *
 * D'ou des JALONS. Et cette partie est pure, donc testable sans navigateur.
 */
describe('secondesRestantes', () => {
  it('rend le temps restant, arrondi vers le haut', () => {
    expect(secondesRestantes(10_400, 0)).toBe(11);
  });

  it('ne rend jamais de valeur negative', () => {
    expect(secondesRestantes(1_000, 9_000)).toBe(0);
  });

  it('rend zero pile a l echeance', () => {
    expect(secondesRestantes(5_000, 5_000)).toBe(0);
  });
});

describe('jalonAtteint', () => {
  it('annonce aux jalons de la spec, et nulle part ailleurs', () => {
    expect([...JALONS_SECONDES]).toEqual([30, 20, 10, 5, 3, 2, 1]);
    expect(jalonAtteint(10, 11)).toBe(10);
    expect(jalonAtteint(5, 6)).toBe(5);
  });

  /**
   * ⛔ LE PIEGE. Sans ce garde, un `role="status"` reannonce a chaque rendu
   * React, et React rend plusieurs fois par seconde. Un lecteur d'ecran
   * repeterait « dix secondes » en boucle, ce qui est PIRE qu'un decompte muet.
   */
  it('n annonce pas deux fois le meme jalon', () => {
    expect(jalonAtteint(10, 10)).toBeNull();
  });

  it('n annonce rien entre deux jalons', () => {
    expect(jalonAtteint(15, 16)).toBeNull();
    expect(jalonAtteint(8, 9)).toBeNull();
  });

  /**
   * ⛔ Un saut de plusieurs jalons doit annoncer le PLUS BAS atteint, et un
   * seul. Une page mise en arriere-plan par le navigateur gele ses minuteurs :
   * au retour, dix secondes ont pu passer d'un coup.
   */
  it('annonce le jalon le plus bas quand plusieurs sont franchis d un coup', () => {
    expect(jalonAtteint(4, 12)).toBe(5);
  });

  it('n annonce rien au-dessus du premier jalon', () => {
    expect(jalonAtteint(45, 60)).toBeNull();
  });

  it('n annonce rien quand il n y a aucun minuteur', () => {
    expect(jalonAtteint(null, null)).toBeNull();
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/presentation/ui/countdown.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -m1 "Cannot find module" /tmp/v.log
```

Expected: **CODE : 1**, `Cannot find module './countdown.js'`.

- [ ] **Step 3 : écrire la part pure du minuteur**

`packages/module-quiz/src/presentation/ui/countdown.tsx` :

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Spec § 8 point 2. Les jalons, et non chaque seconde : le contenu d'un
 * `role="status"` qui change trente fois noie l'utilisateur de lecteur d'écran
 * sous trente annonces, ce qui est pire qu'un décompte muet.
 *
 * Resserrés sur la fin, là où l'information compte.
 */
export const JALONS_SECONDES = [30, 20, 10, 5, 3, 2, 1] as const;

export function secondesRestantes(deadlineMs: number, maintenantMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - maintenantMs) / 1000));
}

/**
 * Le jalon à annoncer, ou `null`. Pure, donc testable sans navigateur.
 *
 * ⛔ Compare au tour PRÉCÉDENT, et c'est tout l'objet : sans ça, un
 * `role="status"` réannonce à chaque rendu React, et React rend plusieurs fois
 * par seconde.
 *
 * ⛔ Rend le jalon le PLUS BAS franchi quand plusieurs le sont d'un coup : un
 * onglet mis en arrière-plan gèle ses minuteurs, donc dix secondes peuvent
 * passer d'un bloc au retour.
 */
export function jalonAtteint(restant: number | null, precedent: number | null): number | null {
  if (restant === null || precedent === null) return null;
  if (restant >= precedent) return null;

  const franchis = JALONS_SECONDES.filter((jalon) => restant <= jalon && precedent > jalon);
  if (franchis.length === 0) return null;
  return Math.min(...franchis);
}

export function Countdown({ deadlineAt }: { deadlineAt: string | null }) {
  const t = useTranslations('module.quiz.play');
  const [restant, setRestant] = useState<number | null>(null);
  const precedent = useRef<number | null>(null);
  const [annonce, setAnnonce] = useState<string>('');

  useEffect(() => {
    if (deadlineAt === null) {
      setRestant(null);
      return;
    }
    const echeance = new Date(deadlineAt).getTime();

    function battre(): void {
      const valeur = secondesRestantes(echeance, Date.now());
      const jalon = jalonAtteint(valeur, precedent.current);
      if (jalon !== null) setAnnonce(t('secondsLeft', { count: jalon }));
      precedent.current = valeur;
      setRestant(valeur);
    }

    battre();
    const battement = setInterval(battre, 250);
    return () => clearInterval(battement);
  }, [deadlineAt, t]);

  if (restant === null) return null;

  return (
    <div className="flex flex-col gap-1">
      {/*
        La taille et la couleur viennent de CSS, jamais du HTML : RGAA
        thématique 10, et c'est déjà une règle de ce dépôt. `text-5xl` survit
        donc au zoom texte (spec § 8 point 4).
      */}
      <p className="text-5xl font-bold tabular-nums" data-testid="countdown" aria-hidden="true">
        {restant}
      </p>
      {/*
        ⛔ `role="status"` et non `aria-live="assertive"` : status est poli, donc
        il n'interrompt pas la lecture de l'énoncé. Et surtout il NE VOLE PAS LE
        FOCUS, `autoFocus` est banni dans ce dépôt pour la même raison.
      */}
      <p role="status" className="sr-only" data-testid="countdown-announce">
        {annonce}
      </p>
    </div>
  );
}
```

- [ ] **Step 4 : lancer les tests pour les voir passer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/presentation/ui/countdown.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: **CODE : 0**, 10 tests verts.

- [ ] **Step 5 : prouver les deux gardes du minuteur**

```bash
cp packages/module-quiz/src/presentation/ui/countdown.tsx /tmp/cd.bak

echo "### M1 : le jalon se reannonce a chaque rendu"
sed -i "s|  if (restant >= precedent) return null;||" packages/module-quiz/src/presentation/ui/countdown.tsx
pnpm --filter @quetzal/module-quiz exec vitest run src/presentation/ui/countdown.spec.ts > /tmp/v1.log 2>&1; echo "CODE : $?"
grep -E "deux fois le meme jalon" /tmp/v1.log | head -2
cp /tmp/cd.bak packages/module-quiz/src/presentation/ui/countdown.tsx

echo "### M2 : un saut de jalons annonce le plus HAUT au lieu du plus bas"
sed -i "s|  return Math.min(...franchis);|  return Math.max(...franchis);|" packages/module-quiz/src/presentation/ui/countdown.tsx
pnpm --filter @quetzal/module-quiz exec vitest run src/presentation/ui/countdown.spec.ts > /tmp/v2.log 2>&1; echo "CODE : $?"
grep -E "plusieurs sont franchis" /tmp/v2.log | head -2
cp /tmp/cd.bak packages/module-quiz/src/presentation/ui/countdown.tsx

echo "### restauration"
pnpm --filter @quetzal/module-quiz exec vitest run src/presentation/ui/countdown.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
```

Expected: M1 et M2 chacune **CODE : 1** sur le test nommé, puis **CODE : 0**.

- [ ] **Step 6 : les clés de l'écran élève**

Ajouter dans `fr.json`, sous `module.quiz` :

```json
      "play": {
        "waiting": "Attends que la question s affiche",
        "secondsLeft": "{count} seconde(s) restante(s)",
        "answerChoice": "Choisis une réponse",
        "answerTyped": "Écris ta réponse",
        "send": "Envoyer",
        "sent": "Réponse envoyée",
        "correct": "Juste",
        "wrong": "Faux",
        "inGrace": "Réponse acceptée de justesse",
        "tooLate": "Trop tard pour cette question",
        "alreadyAnswered": "Tu as déjà répondu à cette question",
        "closed": "La question est fermée",
        "finished": "La séance est terminée",
        "yourScore": "Ton score : {score}",
        "podium": "Classement",
        "error": {
          "notOpen": "La séance n a pas encore commencé",
          "notFound": "Cette séance n existe pas",
          "full": "La séance est complète",
          "generic": "Impossible de rejoindre pour le moment. Préviens ton enseignante."
        }
      }
```

Les mêmes clés dans `en.json` et `es.json`.

- [ ] **Step 7 : écrire l'écran élève**

`packages/module-quiz/src/presentation/ui/guest-play.tsx` :

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { GuestJoinProps } from '@quetzal/core';
import { Button, Card, Input, Label } from '@quetzal/ui';
import { Countdown } from './countdown.js';
import { useQuizSocket } from './use-quiz-socket.js';

interface OptionVue {
  id: string;
  rank: number;
  label: string | null;
  imageId: string | null;
  imageAlt: string | null;
}

interface RefusalBody {
  error?: string | undefined;
  max?: number | undefined;
}

export default function GuestPlay({ tenantId, moduleSlug, sessionId }: GuestJoinProps) {
  const t = useTranslations('module.quiz.play');
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
      // Le code du refus, traduit. Issue #75 : afficher `res.status` montrerait
      // « 409 » sur le téléphone d'un élève.
      setTokenError(await refusalMessage(res, tGuest));
      return;
    }
    const { token } = (await res.json()) as { token: string };
    setGuestToken(token);
  }

  if (guestToken === undefined) {
    return (
      <Card className="w-full max-w-sm p-6">
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
          {/* ⛔ Cible tactile large : `h-14` et pleine largeur. Spec §8 point 3 :
              viser mal plus un délai serré est une double pénalité. */}
          <Button type="submit" className="h-14 w-full text-lg">
            {tButton('join')}
          </Button>
        </form>
      </Card>
    );
  }

  return <PlayBoard sessionId={sessionId} guestToken={guestToken} />;
}

function PlayBoard({ sessionId, guestToken }: { sessionId: string; guestToken: string }) {
  const t = useTranslations('module.quiz.play');
  const { state, question, result, refusal, finished, error } = useQuizSocket({
    sessionId,
    guestToken,
  });
  const [saisie, setSaisie] = useState('');
  const [envoye, setEnvoye] = useState(false);

  // Une nouvelle question réarme l'écran : sans ça, le résultat de la
  // précédente resterait affiché par-dessus la suivante.
  useEffect(() => {
    setEnvoye(false);
    setSaisie('');
  }, [question?.sessionQuestionId]);

  if (error !== null) return <p role="alert">{messageDErreur(error, t)}</p>;

  if (finished !== null) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col gap-3 p-3">
        <p role="status" data-testid="finished">{t('finished')}</p>
        <h2 className="text-xl">{t('podium')}</h2>
        <ol className="flex flex-col gap-1" data-testid="podium">
          {finished.classement.map((ligne) => (
            <li key={ligne.participantId}>
              {t('yourScore', { score: ligne.score })}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (state === null || question === null) return <p>{t('waiting')}</p>;

  function repondre(payload: { optionId?: string; value?: string }): void {
    setEnvoye(true);
    state?.socket?.emit('answer', payload);
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-3">
      <Countdown deadlineAt={question.deadlineAt} />

      <h1 className="text-xl font-semibold">{question.prompt}</h1>

      {question.imageId !== null && (
        // ⛔ `alt` obligatoire, jamais vide par défaut. Si Elda n'a rien écrit,
        // la tâche 14 du plan 1 a mis le nom du fichier en pis-aller : mieux
        // qu'un mur, et l'avertissement reste côté autorat.
        <img
          src={`/api/modules/quiz/images/${question.imageId}`}
          alt={question.imageAlt ?? ''}
          className="w-full rounded"
        />
      )}

      {question.answerMode === 'choix' ? (
        <fieldset className="flex flex-col gap-3">
          <legend>{t('answerChoice')}</legend>
          {question.options.map((option: OptionVue) => (
            <Button
              key={option.id}
              /* ⛔ h-20 et gap-3 : cibles LARGES et ESPACEES. Spec §8 point 3,
                 et les tailles viennent de CSS donc elles survivent au zoom
                 texte (point 4, RGAA thématique 10). */
              className="h-20 w-full text-lg"
              disabled={envoye}
              onClick={() => repondre({ optionId: option.id })}
              data-testid={`option-${option.rank}`}
            >
              {option.label ?? ''}
            </Button>
          ))}
        </fieldset>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            repondre({ value: saisie });
          }}
        >
          <Label htmlFor="answer">{t('answerTyped')}</Label>
          <Input
            id="answer"
            className="h-14 text-lg"
            maxLength={160}
            value={saisie}
            disabled={envoye}
            onChange={(event) => setSaisie(event.target.value)}
          />
          <Button type="submit" className="h-14 w-full text-lg" disabled={envoye}>
            {t('send')}
          </Button>
        </form>
      )}

      {envoye && result === null && refusal === null && (
        <p role="status">{t('sent')}</p>
      )}

      {result !== null && (
        <p role="status" data-testid="answer-result">
          {result.isCorrect ? t('correct') : t('wrong')}
          {result.dansLaGrace ? ` ${t('inGrace')}` : ''}
        </p>
      )}

      {/* `data-testid` et pas seulement `role`: après l'entrée, Next ajoute son
          annonceur de route, un `<div role="alert">` vide, et
          `getByRole('alert')` en trouverait DEUX. Voir le commentaire de
          `loto-guest.e2e.spec.ts` : un test qui visait le rôle passait quand le
          message n'apparaissait PAS. */}
      {refusal !== null && (
        <p role="alert" data-testid="answer-refused">
          {messageDeRefus(refusal, t)}
        </p>
      )}
    </div>
  );
}

/** Lu sans `as` : le corps vient du réseau (CLAUDE.md §14). */
function lireRefus(corps: unknown): RefusalBody {
  if (typeof corps !== 'object' || corps === null) return {};
  return {
    error: 'error' in corps && typeof corps.error === 'string' ? corps.error : undefined,
    max: 'max' in corps && typeof corps.max === 'number' ? corps.max : undefined,
  };
}

async function refusalMessage(
  res: Response,
  t: (key: string, values?: Record<string, string | number>) => string): Promise<string> {
  let body: RefusalBody;
  try {
    body = lireRefus(await res.json());
  } catch {
    return t('error.generic');
  }
  switch (body.error) {
    case 'guest_session_full':
      return t('error.session_full', { max: body.max ?? 0 });
    case 'guests_not_allowed':
      return t('error.guests_not_allowed');
    default:
      return t('error.generic');
  }
}

/**
 * Le NOM de la classe d'erreur, traduit. Jamais affiché tel quel : le loto
 * montrait « GameNotRunningError » à un élève de collège.
 */
function messageDErreur(reason: string, t: (key: string) => string): string {
  switch (reason) {
    case 'SessionClosedToJoinError':
      return t('error.notOpen');
    case 'SessionNotFoundError':
      return t('error.notFound');
    case 'SessionFullError':
      return t('error.full');
    default:
      return t('error.generic');
  }
}

function messageDeRefus(reason: string, t: (key: string) => string): string {
  switch (reason) {
    case 'AnswerTooLateError':
      return t('tooLate');
    case 'AlreadyAnsweredError':
      return t('alreadyAnswered');
    case 'NoQuestionOpenError':
      return t('closed');
    default:
      return t('error.generic');
  }
}
```

- [ ] **Step 8 : vérifier le plancher point par point**

Chaque point de la spec § 8 doit se voir dans le code. Relevé, pas supposé :

```bash
echo "### point 1, marge de grace : affichee a l eleve ?"
grep -c "inGrace" packages/module-quiz/src/presentation/ui/guest-play.tsx
echo "### point 2, minuteur annonce par role=status, sans voler le focus ?"
grep -n 'role="status"' packages/module-quiz/src/presentation/ui/countdown.tsx
grep -c "autoFocus" packages/module-quiz/src/presentation/ui/*.tsx
echo "--- attendu : au moins 1 role=status, et 0 autoFocus ---"
echo "### point 3, cibles larges et espacees en mode choix ?"
grep -n "h-20 w-full\|gap-3" packages/module-quiz/src/presentation/ui/guest-play.tsx | head -3
echo "### point 4, presentation en CSS et jamais en HTML ?"
grep -cE "<font|size=|<center|style=\{\{" packages/module-quiz/src/presentation/ui/*.tsx
echo "--- attendu : 0 ---"
echo "### point 5, delai par question : le minuteur lit l echeance figee ?"
grep -n "deadlineAt" packages/module-quiz/src/presentation/ui/countdown.tsx | head -2
```

Expected: `inGrace` au moins une fois, au moins un `role="status"`, **zéro**
`autoFocus`, les classes de cible larges présentes, **zéro** présentation en
HTML, et le minuteur qui lit `deadlineAt`.

⛔ Un zéro attendu qui n'est pas zéro est un point du plancher non tenu. Le
corriger avant de continuer, et ne pas le reporter : la spec dit « ce ne sont pas
des arbitrages ».

- [ ] **Step 9 : commit, en deux**

```bash
git add packages/module-quiz/src/presentation/ui/countdown.spec.ts
git commit -m "test(quiz): exiger que le minuteur s annonce par jalons, pas chaque seconde

Spec §8 point 2. Vu rouge d abord.

Un decompte uniquement visuel est INVISIBLE a un lecteur d ecran. Mais un
role=status qui change trente fois est PIRE que rien : il noie l
utilisateur sous trente annonces. D ou des jalons, resserres sur la fin.

Deux tests portent des pieges invisibles :

- ne pas reannoncer le MEME jalon. Sans ce garde, le role=status
  reannonce a chaque rendu React, et React rend plusieurs fois par
  seconde.
- annoncer le jalon le PLUS BAS quand plusieurs sont franchis d un coup :
  un onglet mis en arriere-plan gele ses minuteurs, donc dix secondes
  peuvent passer d un bloc au retour."
git add packages/module-quiz/src/presentation/ui packages/i18n/catalogues
git commit -m "feat(quiz): l ecran eleve, et le plancher d accessibilite en entier

Les cinq points de la spec §8, chacun avec son critere :

1. la grace est AFFICHEE a l eleve, pas seulement accordee.
2. role=status et non aria-live=assertive : poli, donc il n interrompt
   pas la lecture de l enonce, et il NE VOLE PAS LE FOCUS, autoFocus est
   banni dans ce depot pour la meme raison.
3. cibles h-20 pleine largeur et gap-3 : viser mal plus un delai serre
   est une double penalite qui annulerait tout le reste.
4. toute la presentation en CSS, jamais en HTML (RGAA thematique 10),
   donc le minuteur et les boutons survivent au zoom texte.
5. le minuteur lit l echeance FIGEE, donc le delai par question joue.

Le nom de la classe d erreur est traduit et jamais affiche tel quel : le
loto montrait « GameNotRunningError » a un eleve de college. Et un refus
d echeance s affiche au lieu de casser la page.

La tache fait RELEVER chaque point par un grep dont l attendu est ecrit,
plutot que de les supposer tenus."
```

---

## Task 18 : le retour de séance à l'écran

**Files:**
- Create: `packages/module-quiz/src/presentation/ui/session-report.tsx`

- [ ] **Step 1 : écrire l'écran**

`packages/module-quiz/src/presentation/ui/session-report.tsx` :

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient } from '@quetzal/core/client';
import { Card } from '@quetzal/ui';

interface LigneClassement {
  participantId: string;
  label: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  missingCount: number;
}

interface QuestionRapport {
  sessionQuestionId: string;
  rank: number;
  prompt: string;
  answerCount: number;
  correctCount: number;
}

interface Rapport {
  questionCount: number;
  participantCount: number;
  questions: QuestionRapport[];
  classement: LigneClassement[];
}

/**
 * ⛔ Les props sont un `Record<string, string>` et NON une forme nommée, parce
 * que c'est ce que le contrat du noyau impose à tout composant de route :
 * `QuetzalRoute.component` veut un
 * `ComponentType<Readonly<Record<string, string>>>`.
 *
 * Une signature nommée, `{ sessionId }: { sessionId: string }`, ne compile pas :
 * « Property 'sessionId' is missing in type 'Readonly<Record<string, string>>' ».
 * Mesuré le 12/11 ; la première version de ce plan portait la forme fautive.
 *
 * Même forme que le jumeau `module-loto/src/presentation/ui/deck-editor.tsx`,
 * garde comprise : le paramètre peut être absent, et chaque fonction async
 * doit s'en protéger.
 */
type Props = Readonly<Record<string, string>>;

export default function SessionReport(props: Props) {
  const sessionId = props['sessionId'];
  const t = useTranslations('module.quiz.session');
  const [rapport, setRapport] = useState<Rapport | null>(null);

  useEffect(() => {
    async function charger(): Promise<void> {
      const res = await apiClient().apiFetch(`/api/modules/quiz/sessions/${sessionId}/report`);
      setRapport((await res.json()) as Rapport);
    }
    void charger();
  }, [sessionId]);

  if (rapport === null) return <p>{t('waiting')}</p>;

  return (
    <Card className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">{t('report')}</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl">{t('reportByQuestion')}</h2>
        {/*
          Le tableau scrolle dans SON conteneur : une page qui scrolle
          horizontalement est inutilisable au zoom, et c'est une règle du dépôt.
        */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">{t('reportByQuestion')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('reportColRank')}</th>
                <th scope="col">{t('reportColPrompt')}</th>
                <th scope="col">{t('reportColCorrect')}</th>
                <th scope="col">{t('reportColAnswered')}</th>
              </tr>
            </thead>
            <tbody data-testid="report-questions">
              {rapport.questions.map((question) => (
                <tr key={question.sessionQuestionId}>
                  <td>{question.rank}</td>
                  <td>{question.prompt}</td>
                  <td>{question.correctCount}</td>
                  <td>{question.answerCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl">{t('reportByParticipant')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">{t('reportByParticipant')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('reportColName')}</th>
                <th scope="col">{t('reportColScore')}</th>
                <th scope="col">{t('reportColCorrect')}</th>
                <th scope="col">{t('reportColWrong')}</th>
                {/* ⛔ Une colonne PROPRE pour les absences : les fondre dans
                    « faux » donnerait un diagnostic faux, et c'est le seul
                    écran qu'Elda regarde après la séance. */}
                <th scope="col">{t('reportColMissing')}</th>
              </tr>
            </thead>
            <tbody data-testid="report-classement">
              {rapport.classement.map((ligne) => (
                <tr key={ligne.participantId}>
                  <td>{ligne.label}</td>
                  <td>{ligne.score}</td>
                  <td>{ligne.correctCount}</td>
                  <td>{ligne.wrongCount}</td>
                  <td>{ligne.missingCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Card>
  );
}
```

Ajouter les sept clés (`reportByQuestion`, `reportByParticipant`, `reportColRank`,
`reportColPrompt`, `reportColCorrect`, `reportColAnswered`, `reportColName`,
`reportColScore`, `reportColWrong`, `reportColMissing`) dans les **trois**
catalogues.

- [ ] **Step 2 : vérifier, puis commit**

```bash
pnpm --filter @quetzal/module-quiz exec eslint src > /tmp/l.log 2>&1; echo "LINT : $?"
pnpm --filter @quetzal/i18n exec vitest run > /tmp/v.log 2>&1; echo "I18N : $?"
echo "### en-tetes de colonnes portees par scope=col ?"
grep -c 'scope="col"' packages/module-quiz/src/presentation/ui/session-report.tsx
echo "--- attendu : 9 ---"
echo "### chaque tableau a une legende ?"
grep -c "<caption" packages/module-quiz/src/presentation/ui/session-report.tsx
echo "--- attendu : 2 ---"
```

Expected: **CODE : 0** aux deux, 9 `scope="col"` et 2 `<caption>`. ⛔ Un tableau
de données sans `scope` ni `caption` est un échec RGAA 5.4 et 5.7 : le corriger,
pas le reporter.

```bash
git add packages/module-quiz/src/presentation/ui/session-report.tsx packages/i18n/catalogues
git commit -m "feat(quiz): le retour de seance a l ecran

Deux tableaux : par question, pour dire laquelle a echoue ; et par
participant.

⛔ Une colonne PROPRE pour les absences, distincte de « faux ». Les
fondre donnerait a Elda un diagnostic faux, et c est le seul ecran
qu elle regarde apres la seance.

Chaque tableau porte un caption et des scope=col (RGAA 5.4 et 5.7), et
scrolle dans SON conteneur : une page qui scrolle horizontalement est
inutilisable au zoom."
```

---

## Task 19 : l'e2e d'une séance complète, dans les deux modes

**Files:**
- Create: `e2e/tests/quiz-seance.e2e.spec.ts`

- [ ] **Step 1 : écrire le test**

`e2e/tests/quiz-seance.e2e.spec.ts`, reprendre la structure de
`e2e/tests/loto-guest.e2e.spec.ts`, qui porte déjà la connexion animatrice et
l'ouverture d'un contexte invité séparé.

```ts
import { test, expect } from '@playwright/test';

/**
 * Spec §9 : « E2E pour une séance complète dans chacun des deux modes. »
 *
 * ⚠️ Deux pièges de mesure connus, à ne pas redécouvrir :
 * - `/api/guest-token` est plafonné à cent jetons par heure. Ce fichier en
 *   consomme deux par exécution ; enchaîner les essais finira par rendre 429,
 *   et un 429 n'est pas un échec du produit.
 * - mesurer un taux d'instabilité e2e par exécutions répétées contre un serveur
 *   de longue vie est INVALIDE (issue #68). Ne pas en tirer de statistique.
 */
test.describe('quiz : une séance complète', () => {
  test('mode défi : une question, une réponse juste, un score', async ({ page, browser }) => {
    await page.goto('/modules/quiz');

    // La banque semée par le seed du module.
    await page.getByRole('link', { name: /ouvrir la banque/i }).first().click();
    await expect(page.getByTestId('quiz-questions')).toBeVisible();

    // Créer la séance par l'API : l'écran de création n'est pas l'objet du test.
    const session = await page.evaluate(async () => {
      const banques = await (await fetch('/api/modules/quiz/banks')).json();
      const res = await fetch('/api/modules/quiz/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: banques.banks[0].id,
          mode: 'defi',
          maxParticipants: 4,
          defaultTimeLimit: 60,
        }),
      });
      return res.json();
    });

    await page.goto(`/modules/quiz/sessions/${session.id}`);
    await page.getByTestId('open').click();
    await expect(page.getByTestId('join-code')).toContainText(session.joinCode);

    // L'élève, dans son propre contexte : un `storageState` partagé ferait
    // entrer l'animatrice comme invitée.
    const contexteEleve = await browser.newContext();
    const eleve = await contexteEleve.newPage();
    await eleve.goto(`/join/${session.joinCode}`);
    await eleve.getByLabel(/pseudo|name|apodo/i).fill('Ana');
    await eleve.getByRole('button', { name: /rejoindre|join|entrar/i }).click();

    await expect(page.getByTestId('participant-count')).toContainText('1');

    await page.getByTestId('start').click();
    await page.getByTestId('next').click();

    // ⛔ Le minuteur doit être VISIBLE et ANNONCÉ : les deux, pas l'un.
    await expect(eleve.getByTestId('countdown')).toBeVisible();
    await expect(eleve.getByTestId('countdown-announce')).toBeAttached();

    await eleve.getByTestId('option-1').click();
    await expect(eleve.getByTestId('answer-result')).toBeVisible();

    await page.getByTestId('close').click();
    await expect(page.getByTestId('question-result')).toBeVisible();

    await page.getByTestId('finish').click();
    await expect(eleve.getByTestId('podium')).toBeVisible();

    await contexteEleve.close();
  });

  test('mode contrôle : aucun minuteur, et la réponse tardive compte', async ({ page, browser }) => {
    await page.goto('/modules/quiz');

    const session = await page.evaluate(async () => {
      const banques = await (await fetch('/api/modules/quiz/banks')).json();
      const res = await fetch('/api/modules/quiz/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: banques.banks[0].id,
          mode: 'controle',
          maxParticipants: 4,
          defaultTimeLimit: null,
        }),
      });
      return res.json();
    });

    await page.goto(`/modules/quiz/sessions/${session.id}`);
    await page.getByTestId('open').click();

    const contexteEleve = await browser.newContext();
    const eleve = await contexteEleve.newPage();
    await eleve.goto(`/join/${session.joinCode}`);
    await eleve.getByLabel(/pseudo|name|apodo/i).fill('Bea');
    await eleve.getByRole('button', { name: /rejoindre|join|entrar/i }).click();

    await page.getByTestId('start').click();
    await page.getByTestId('next').click();

    // ⛔ D6 ET spec §8 : aucun minuteur en mode contrôle, donc aucun décompte à
    // l'écran. C'est ce qui fait que WCAG 2.2.1 ne s'applique pas à ce mode, et
    // c'est la condition qui tient tout le § 8 : le défi ne doit jamais être le
    // seul canal vers un contenu.
    await expect(eleve.getByTestId('countdown')).toHaveCount(0);

    await eleve.getByTestId('option-1').click();
    await expect(eleve.getByTestId('answer-result')).toBeVisible();

    await page.getByTestId('close').click();
    await page.getByTestId('finish').click();

    // Le retour de séance, le vrai livrable pour Elda.
    await page.goto(`/modules/quiz/sessions/${session.id}/report`);
    await expect(page.getByTestId('report-questions')).toBeVisible();
    await expect(page.getByTestId('report-classement')).toBeVisible();

    await contexteEleve.close();
  });
});
```

- [ ] **Step 2 : semer une banque de quiz**

L'e2e a besoin d'une banque avec au moins une question bien formée. Étendre le
seed du module, `packages/module-quiz/src/seed.ts`, sur le modèle de celui du
loto, avec une banque `isTemplate: true` de trois questions en `choix` et une en
`saisie`, puis la brancher au script de seed de la recette e2e.

⚠️ Sans ce seed, les deux tests échoueront sur `banques.banks[0]` indéfini, et
ce serait un échec **du harnais**, pas du produit.

- [ ] **Step 3 : commit**

```bash
git add e2e/tests/quiz-seance.e2e.spec.ts packages/module-quiz/src/seed.ts
git commit -m "test(quiz): une seance complete de bout en bout, dans les deux modes

Spec §9. Deux parcours entiers : ouvrir, entrer, demarrer, ouvrir une
question, repondre, fermer, terminer, lire le retour.

⛔ Le test du mode controle garde la condition qui tient TOUT le §8 :
aucun decompte a l ecran, donc WCAG 2.2.1 ne s applique pas a ce mode, et
le defi n est jamais le seul canal vers un contenu.

Le test du mode defi exige que le minuteur soit VISIBLE et ANNONCE, les
deux et pas l un.

Chaque eleve a son propre contexte navigateur : un storageState partage
ferait entrer l animatrice comme invitee.

Les deux pieges de mesure de la spec sont nommes dans l en-tete pour ne
pas etre redecouverts : cent jetons d invite par heure, et l invalidite
d une mesure d instabilite par executions repetees (#68)."
```

---

## Task 20 : la vérification complète, et la PR

- [ ] **Step 1 : les portes, par paquet, avec un code de sortie**

```bash
cd /c/Users/sylva/Documents/projects/quetzal
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP Neon"; exit 1;; esac
case "$DATABASE_URL" in *localhost:5432*) : ;; *) echo "STOP pas local"; exit 1;; esac

TSC=node_modules/typescript/bin/tsc
node $TSC --noEmit --project packages/core/tsconfig.json > /tmp/t1.log 2>&1;              echo "TYPES core  : $?"
node $TSC --noEmit --project packages/module-quiz/tsconfig.typecheck.json > /tmp/t2.log 2>&1; echo "TYPES quiz  : $?"
node $TSC --noEmit --project apps/api/tsconfig.json > /tmp/t3.log 2>&1;                   echo "TYPES api   : $?"
cat /tmp/t1.log /tmp/t2.log /tmp/t3.log | grep "error TS" | head -5

for p in @quetzal/core @quetzal/module-quiz @quetzal/module-loto @quetzal/i18n quetzal-api; do
  pnpm --filter $p exec eslint src > /tmp/l.log 2>&1; echo "LINT $p : $?"
done

pnpm --filter @quetzal/core test > /tmp/v1.log 2>&1;          echo "UNIT core : $?  $(grep -oE 'Tests  [0-9]+ passed' /tmp/v1.log | tail -1)"
pnpm --filter @quetzal/module-quiz exec vitest run > /tmp/v2.log 2>&1; echo "UNIT quiz : $?  $(grep -oE 'Tests  [0-9]+ passed' /tmp/v2.log | tail -1)"
pnpm --filter @quetzal/module-loto exec vitest run > /tmp/v3.log 2>&1; echo "UNIT loto : $?  $(grep -oE 'Tests  [0-9]+ passed' /tmp/v3.log | tail -1)"
pnpm --filter @quetzal/i18n exec vitest run > /tmp/v4.log 2>&1;       echo "I18N      : $?"
```

Expected: **tous les codes à 0**, et aucune ligne `error TS`.

- [ ] **Step 2 : l'intégration, contre un vrai Postgres**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
pnpm --filter @quetzal/module-quiz exec vitest run --config vitest.integration.config.ts --reporter=verbose > /tmp/i1.log 2>&1; echo "INT quiz : $?"
grep -cE "^ *✓" /tmp/i1.log
pnpm --filter @quetzal/core exec vitest run --config vitest.integration.config.ts > /tmp/i2.log 2>&1; echo "INT core : $?"
pnpm --filter @quetzal/module-loto exec vitest run --config vitest.integration.config.ts > /tmp/i3.log 2>&1; echo "INT loto : $?"
pnpm --filter quetzal-api exec vitest run --config vitest.integration.config.ts > /tmp/i4.log 2>&1; echo "INT api  : $?"
```

Expected: les quatre **à 0**.

- [ ] **Step 3 : la recette locale complète, avec son témoin de fraîcheur**

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP Neon"; exit 1;; esac
case "$DATABASE_URL" in *localhost:5432*) : ;; *) echo "STOP pas local"; exit 1;; esac
export BETTER_AUTH_SECRET="e2e-local-secret-not-a-real-one-0123456789"
export GUEST_TOKEN_SECRET="e2e-local-guest-secret-0123456789"
export HOST_URL="http://localhost:3010" API_URL="http://localhost:3011"
export NEXT_PUBLIC_API_URL="http://localhost:3011" NEXT_PUBLIC_HOST_URL="http://localhost:3010"
export MODULES="hello,loto,quiz" NEXT_PUBLIC_MODULES="hello,loto,quiz"
export SEED_OWNER_EMAIL="elda@test.dev" SEED_OWNER_PASSWORD="TestPassword123!"
export E2E_HOST_URL="http://localhost:3010"

pnpm --filter @quetzal/db prisma:migrate:deploy > /tmp/m.log 2>&1; echo "MIGRATE : $?"
pnpm --filter @quetzal/db prisma:generate > /tmp/g.log 2>&1;       echo "GENERATE: $?"
# ⛔ CLAUDE.md §11 : un .next perime fait echouer next build sur un TypeError
# qui ne nomme AUCUN fichier.
rm -rf apps/host/.next
pnpm build > /tmp/b.log 2>&1; echo "BUILD   : $?"
tail -3 /tmp/b.log
```

Expected: les trois **à 0**.

```bash
echo "### TEMOIN DE FRAICHEUR, avant toute verification"
grep -c "quiz" apps/host/src/lib/module-loaders.generated.ts
echo "--- attendu : au moins 1 ---"
grep -c "GRACE_MS" packages/module-quiz/dist/domain/scoring.js
echo "--- attendu : au moins 1 ---"
```

⛔ **Sans ces deux témoins, la suite ne vérifie rien** : elle pourrait tourner
sur un host sans module quiz et tomber sur des erreurs trompeuses. C'est
`CLAUDE.md` §11.

```bash
pnpm --filter @quetzal/auth seed > /tmp/s.log 2>&1; echo "SEED : $?"
PORT=3011 pnpm --filter quetzal-api start &
pnpm --filter quetzal-host exec next start -p 3010 &
```

⛔ **Jamais `pnpm dev`** : il lit `.env.local`, qui pointe sur Neon.

- [ ] **Step 4 : la suite e2e complète**

```bash
pnpm exec playwright test --reporter=line > /tmp/e.log 2>&1; echo "E2E : $?"
tail -12 /tmp/e.log
```

Expected: **CODE : 0**. ⚠️ Si `loto-guest` ou `enchainer-les-figures` rougit, ce
n'est **pas** ce plan : relire le commentaire de `loto-guest.e2e.spec.ts` et
l'issue #68 avant de soupçonner son propre travail.

- [ ] **Step 5 : le geste complet d'Elda, par l'API**

```bash
curl -s -X POST "http://localhost:3010/api/auth/sign-in/email" \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3010" \
  -c /tmp/cookies.txt -d '{"email":"elda@test.dev","password":"TestPassword123!"}' > /dev/null
JETON=$(curl -s -b /tmp/cookies.txt http://localhost:3010/api/auth/token \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")
AUTH="-H \"Authorization: Bearer $JETON\" -H \"Content-Type: application/json\""

BANQUE=$(curl -s http://localhost:3010/api/modules/quiz/banks -H "Authorization: Bearer $JETON" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).banks[0].id))")

echo "### une seance de defi SANS delai par defaut doit etre refusee a la creation"
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3010/api/modules/quiz/sessions \
  -H "Authorization: Bearer $JETON" -H "Content-Type: application/json" \
  -d "{\"deckId\":\"$BANQUE\",\"mode\":\"defi\",\"maxParticipants\":4,\"defaultTimeLimit\":null}"
echo "--- attendu : 400 ---"

echo "### une seance de controle sans delai est legitime"
SEANCE=$(curl -s -X POST http://localhost:3010/api/modules/quiz/sessions \
  -H "Authorization: Bearer $JETON" -H "Content-Type: application/json" \
  -d "{\"deckId\":\"$BANQUE\",\"mode\":\"controle\",\"maxParticipants\":4,\"defaultTimeLimit\":null}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
echo "seance : $SEANCE"

echo "### demarrer sans avoir ouvert doit etre refuse"
curl -s -o /dev/null -w '%{http_code}\n' -X POST "http://localhost:3010/api/modules/quiz/sessions/$SEANCE/start" \
  -H "Authorization: Bearer $JETON"
echo "--- attendu : 400 ---"

curl -s -o /dev/null -X POST "http://localhost:3010/api/modules/quiz/sessions/$SEANCE/open" -H "Authorization: Bearer $JETON"
curl -s -o /dev/null -X POST "http://localhost:3010/api/modules/quiz/sessions/$SEANCE/start" -H "Authorization: Bearer $JETON"

echo "### fermer sans question ouverte doit etre refuse"
curl -s -o /dev/null -w '%{http_code}\n' -X POST "http://localhost:3010/api/modules/quiz/sessions/$SEANCE/questions/close" \
  -H "Authorization: Bearer $JETON"
echo "--- attendu : 400 ---"

curl -s -o /dev/null -X POST "http://localhost:3010/api/modules/quiz/sessions/$SEANCE/questions/next" -H "Authorization: Bearer $JETON"

echo "### ouvrir une seconde question pendant qu une est ouverte doit etre refuse"
curl -s -o /dev/null -w '%{http_code}\n' -X POST "http://localhost:3010/api/modules/quiz/sessions/$SEANCE/questions/next" \
  -H "Authorization: Bearer $JETON"
echo "--- attendu : 400 ---"

echo "### le retour de seance est lisible"
curl -s "http://localhost:3010/api/modules/quiz/sessions/$SEANCE/report" -H "Authorization: Bearer $JETON" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);console.log('questions jouees :',r.questions.length,'· participants :',r.participantCount);})"
```

Expected: **400** aux trois refus, et un retour lisible.

- [ ] **Step 6 : la mesure de charge, sur le quiz**

L'issue #32 a mesuré le loto. Le quiz a un chemin de réponse différent, donc le
chiffre du loto **ne vaut pas** pour lui.

```bash
node scripts/mesurer-la-charge.mjs 40 http://localhost:3010 http://localhost:3011
```

⚠️ Ce script cible le **loto**. L'adapter au quiz est un travail à part : noter
le besoin et ouvrir une issue plutôt que de supposer que 60 tient aussi pour le
quiz. Le `maxConcurrentPerSession: 60` du manifeste est donc **emprunté à une
mesure faite sur un autre module**, et c'est à dire dans la PR, pas à taire.

- [ ] **Step 7 : arrêter les serveurs et ouvrir la PR**

```bash
kill %1 %2
git push -u origin feat/module-quiz-seance
```

Puis ouvrir la PR vers `main`, avec `Closes #` suivi du numéro de l'issue si une
issue suit ce plan, `Closes`, `Fixes` ou `Resolves`, jamais « Ferme », que
GitHub ne reconnaît pas.

Le corps doit dire, en plus du contexte et du plan de test :

- **ce qui a été vu rougir** par mutation, tâche par tâche ;
- **le garde qu'aucun test ne couvre** : la charge de `question-opened` ne porte
  ni `isCorrect` ni `acceptedAnswers`, vérifié par lecture ;
- **les trois limites assumées** : `maxConcurrentPerSession: 60` emprunté à une
  mesure faite sur le loto, la boucle de réessai du code d'entrée non prouvée par
  un test, et le mode « équipes » qui ne crée pas d'équipes partagées ;
- **les deux issues à ouvrir** : adapter `mesurer-la-charge.mjs` au quiz, et les
  équipes partagées.

---

## Ce que ce plan ne contient pas

- **Les équipes partagées.** Un invité égale un participant ; le mode équipes se
  règle par un `maxParticipants` plus petit, ce qui **refuse** les surnuméraires
  au lieu de les regrouper. Ce n'est pas le partage d'équipe du loto. Issue à
  ouvrir.
- **La mesure de charge du quiz.** Le chemin de réponse diffère de celui du loto,
  donc les 60 du manifeste sont emprunts. Issue à ouvrir.
- **Le partage et l'export** (`module-share`), classés hors périmètre par la spec
  § 3.2.
- **Le renommage de `Loto_CardImage`**, qui reste la dette nommée du plan 1 et
  demande un expand / contract.
