# Module Quiz — plan 2 : la séance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre une banque de questions jouable en classe : Elda ouvre une séance, les élèves entrent au QR code, répondent question par question, et elle lit un retour de séance à la fin.

**Architecture:** Cinq tables figées dans `packages/module-quiz`, et **quatre règles de domaine pures** qui portent toute la valeur : le score, la résolution du délai au figement, la fermeture paresseuse, et la machine d'états. Les commandes passent en HTTP, la diffusion en WebSocket (D9). La question qui fait foi en séance est une **copie figée**, jamais la question éditable (D10).

**Tech Stack:** TypeScript strict · NestJS 11 · Socket.io · Prisma 6 / PostgreSQL · Next 15 · Zod · Vitest · testcontainers · Playwright.

**Spec de référence :** [`docs/superpowers/specs/2026-11-08-quetzal-module-quiz-design.md`](../specs/2026-11-08-quetzal-module-quiz-design.md).

**Plan 1, prérequis :** [`2026-11-08-module-quiz-banque.md`](./2026-11-08-module-quiz-banque.md). Ce plan suppose la banque livrée, le module enregistré, et le port des images remonté au noyau.

---

## ⛔ À lire avant la première commande

**La base locale.** `.env.local` pointe sur la base Neon de **production**. Toute
commande Prisma exporte donc `DATABASE_URL` vers la base locale **dans le même
appel shell**, avec sa garde :

```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/quetzal_test"
case "$DATABASE_URL" in *neon*) echo "STOP"; exit 1;; esac
case "$DATABASE_URL" in *localhost:5432*) : ;; *) echo "STOP pas local"; exit 1;; esac
```

**Ne jamais lancer `pnpm dev`** pour les tests de bout en bout : il lit
`.env.local`.

**Vérifier par paquet, jamais par passe monorepo.** `pnpm lint`, `pnpm typecheck`
et `pnpm test` à la racine prennent chacun deux minutes et dépassent le délai des
outils. Pendant le travail :

```bash
node node_modules/typescript/bin/tsc --noEmit --project packages/module-quiz/tsconfig.typecheck.json > /tmp/t.log 2>&1; echo "CODE : $?"
pnpm --filter @quetzal/module-quiz exec vitest run > /tmp/v.log 2>&1; echo "CODE : $?"
pnpm --filter @quetzal/module-quiz exec eslint src > /tmp/l.log 2>&1; echo "CODE : $?"
```

⛔ **Lire un code de sortie, jamais une absence de lignes.** Et pour affirmer
qu'un test précis est passé, le faire nommer : `--reporter=verbose`. C'est
`CLAUDE.md` §11, et ça vient d'erreurs réelles.

**Après tout changement de modèle Prisma**, dans cet ordre : `schema:merge`,
`generate:tenant-registry`, `prisma:generate`.

---

## Trois constantes que la spec laisse au plan

La spec dit « fixée au plan ». Voici les valeurs et leur raison. Elles vivent
dans un seul fichier, `src/domain/scoring.ts`.

| Constante | Valeur | Raison |
|---|---|---|
| `BASE` | `1000` | Valeur absolue sans importance (spec § 5.3) ; 1000 rend les bonus lisibles à l'unité sans décimale. |
| `BONUS_MAX` | `250` | Exactement `BASE / 4`, imposé par la spec. Seul le **rapport** compte : il porte les trois propriétés de D7. |
| `GRACE_MS` | `500` | Doit dépasser la latence réseau mesurée pour qu'un élève ne paie pas le réseau, et rester petite devant le délai minimum de 3 s. La diffusion à soixante téléphones est à **215 ms de médiane** (#32) ; 500 ms la couvre avec marge et vaut un sixième du plancher. ⚠️ Couvre la médiane, **pas** le p95 du chemin de réponse, qui n'est pas mesuré. |

---

## Ce que la spec dit qui n'est plus vrai

La spec § 7 avertit : « `maxConcurrentPerSession` est aujourd'hui un champ
**décoratif** […] Ce module ne doit pas s'appuyer dessus en le croyant appliqué. »

**Ce n'est plus vrai.** L'issue #75 est close (PR #78) : le plafond est appliqué
à `POST /api/guest-token`, comparé au nombre d'invités **présents**, et le
registre se vide à la fermeture des sockets. Le module peut donc déclarer un
`guestAccess.maxConcurrentPerSession` et compter dessus.

⚠️ Avec une limite à connaître : le plafond et le compte sont en mémoire, donc
par instance. Render en plan gratuit n'en sert qu'une.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `packages/core/src/events/quiz.ts` | contrat public des événements du module, table `QuizEventPayloads` + `emitQuiz` (motif #53) |
| `packages/module-quiz/prisma/models.prisma` | + `Quiz_Session`, `Quiz_SessionQuestion`, `Quiz_Participant`, `Quiz_Member`, `Quiz_Answer` |
| `src/domain/session-mode.ts` | union fermée `defi` / `controle` et son garde |
| `src/domain/session-status.ts` | **règle pure** : la machine d'états et ses transitions permises |
| `src/domain/scoring.ts` | **règle pure** : le score des deux modes, les trois constantes |
| `src/domain/deadline.ts` | **règle pure** : une réponse arrive-t-elle à temps, dans la grâce, ou trop tard |
| `src/domain/time-limit.ts` | **règle pure** : résolution du délai au figement |
| `src/domain/ports/session.repository.ts` | le port de persistance de la séance |
| `src/application/*.use-case.ts` | créer, ouvrir, rejoindre, figer, répondre, fermer, terminer, rapporter |
| `src/infrastructure/prisma-session.repository.ts` | l'adaptateur Prisma |
| `src/presentation/session.controller.ts` | les commandes HTTP (D9) |
| `src/presentation/quiz.gateway.ts` | le seul message entrant : répondre |
| `src/presentation/quiz.broadcaster.ts` | la diffusion vers la salle |
| `src/presentation/ui/host-session.tsx` | l'écran animatrice |
| `src/presentation/ui/guest-play.tsx` | l'écran élève, et le plancher d'accessibilité |
| `src/presentation/ui/session-report.tsx` | le retour de séance (D12) |
| `e2e/tests/quiz-seance.e2e.spec.ts` | une séance complète dans chacun des deux modes |

---

## Task 1 : les dépendances WebSocket, et le contrat d'événements typé

**Files:**
- Modify: `packages/module-quiz/package.json`
- Create: `packages/core/src/events/quiz.ts`
- Test: `packages/core/src/events/quiz.spec.ts`

- [ ] **Step 1 : ajouter les dépendances que le plan 1 avait volontairement omises**

Dans `packages/module-quiz/package.json`, ajouter à `dependencies` :

```json
    "@nestjs/websockets": "^10.4.15",
    "@nestjs/platform-socket.io": "^10.4.15",
    "socket.io": "^4.8.1",
    "socket.io-client": "^4.8.1",
```

puis :

```bash
pnpm install
```

- [ ] **Step 2 : écrire le test du contrat d'événements, qui doit échouer**

`packages/core/src/events/quiz.spec.ts` — copier la structure de
`packages/core/src/events/loto.spec.ts`, qui est le modèle à suivre, et
remplacer son corps par :

```ts
import { describe, it, expect } from 'vitest';
import type { EventBus, EventName } from '../module-contract.js';
import { emitQuiz } from './quiz.js';

/**
 * Motif de l'issue #53 : sans table nom -> charge, les interfaces d'événements
 * sont DECORATIVES. `EventBus.emit<T = unknown>(name: EventName, payload: T)`
 * laisse `T` libre et `EventName` est un gabarit, donc n'importe quel nom avec
 * n'importe quelle charge compile. Mesuré sur le loto : quatre interfaces
 * declaraient un `tenantId` qu'aucune emission n'envoyait, pendant des mois.
 */
class BusEspion implements EventBus {
  readonly emis: { name: EventName; payload: unknown }[] = [];

  async emit(name: EventName, payload: unknown): Promise<void> {
    this.emis.push({ name, payload });
  }

  on(): void {
    // Aucun abonne dans ce test : on juge ce qui part, pas ce qui arrive.
  }
}

describe('emitQuiz', () => {
  it('transmet le nom et la charge au bus, sans les alterer', async () => {
    const bus = new BusEspion();

    await emitQuiz(bus, 'quiz.session.started', {
      sessionId: 's-1',
      deckId: 'b-1',
      mode: 'defi',
      questionCount: 8,
      participantCount: 6,
    });

    expect(bus.emis).toEqual([
      {
        name: 'quiz.session.started',
        payload: {
          sessionId: 's-1',
          deckId: 'b-1',
          mode: 'defi',
          questionCount: 8,
          participantCount: 6,
        },
      },
    ]);
  });

  it('transmet les cinq evenements de la spec', async () => {
    const bus = new BusEspion();

    await emitQuiz(bus, 'quiz.question.opened', {
      sessionId: 's-1',
      sessionQuestionId: 'sq-1',
      rank: 1,
      timeLimitResolved: 20,
    });
    await emitQuiz(bus, 'quiz.answer.recorded', {
      sessionId: 's-1',
      sessionQuestionId: 'sq-1',
      participantId: 'p-1',
      isCorrect: true,
      points: 1200,
    });
    await emitQuiz(bus, 'quiz.question.closed', {
      sessionId: 's-1',
      sessionQuestionId: 'sq-1',
      answerCount: 5,
      correctCount: 3,
    });
    await emitQuiz(bus, 'quiz.session.finished', {
      sessionId: 's-1',
      questionCount: 8,
      participantCount: 6,
      topParticipantId: 'p-2',
    });

    expect(bus.emis.map((e) => e.name)).toEqual([
      'quiz.question.opened',
      'quiz.answer.recorded',
      'quiz.question.closed',
      'quiz.session.finished',
    ]);
  });
});
```

- [ ] **Step 3 : lancer le test pour le voir échouer**

```bash
pnpm --filter @quetzal/core exec vitest run src/events/quiz.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -m1 "Cannot find module" /tmp/v.log
```

Expected: **CODE : 1**, et `Cannot find module './quiz.js'`.

- [ ] **Step 4 : écrire le contrat**

`packages/core/src/events/quiz.ts` :

```ts
import type { EventBus } from '../module-contract.js';

/**
 * Contrat public des événements du module Quiz (`CLAUDE.md` §3 : le type d'un
 * événement vit dans le noyau, jamais chez le module).
 *
 * ⚠️ `mode` est une union fermée ici alors que le `pattern` du loto est un
 * `string` : la différence est voulue. Les figures du loto sont des clés qui
 * vivent dans le module, et le noyau ne doit pas en dépendre ; les deux modes
 * du quiz sont une décision de spec (D3), stable, et les nommer rend le
 * compilateur utile sur la charge.
 */
export interface QuizSessionStartedEvent {
  sessionId: string;
  deckId: string;
  mode: 'defi' | 'controle';
  questionCount: number;
  participantCount: number;
}

export interface QuizQuestionOpenedEvent {
  sessionId: string;
  sessionQuestionId: string;
  rank: number;
  /** Le délai qui FAIT FOI, résolu au figement (D10). `null` en mode contrôle. */
  timeLimitResolved: number | null;
}

export interface QuizAnswerRecordedEvent {
  sessionId: string;
  sessionQuestionId: string;
  participantId: string;
  isCorrect: boolean;
  points: number;
}

export interface QuizQuestionClosedEvent {
  sessionId: string;
  sessionQuestionId: string;
  answerCount: number;
  correctCount: number;
}

export interface QuizSessionFinishedEvent {
  sessionId: string;
  questionCount: number;
  participantCount: number;
  /** `null` quand personne n'a marqué un seul point. */
  topParticipantId: string | null;
}

/**
 * Le nom d'un événement lié à la forme de sa charge. Issue #53.
 *
 * Pas de registre central dans le noyau, délibérément : il obligerait chaque
 * module à s'enregistrer, ce qui interroge la frontière du §3. Une table par
 * module suffit et ne couple rien.
 */
export interface QuizEventPayloads {
  'quiz.session.started': QuizSessionStartedEvent;
  'quiz.question.opened': QuizQuestionOpenedEvent;
  'quiz.answer.recorded': QuizAnswerRecordedEvent;
  'quiz.question.closed': QuizQuestionClosedEvent;
  'quiz.session.finished': QuizSessionFinishedEvent;
}

/**
 * Émettre un événement Quiz en se faisant vérifier par le compilateur.
 *
 * Préférer ceci à `bus.emit('quiz.…', …)` : un nom inconnu, un champ manquant
 * ou un champ en trop ne compile plus.
 */
export async function emitQuiz<K extends keyof QuizEventPayloads>(
  bus: EventBus,
  name: K,
  payload: QuizEventPayloads[K],
): Promise<void> {
  await bus.emit(name, payload);
}
```

⚠️ Aucun ajout à `packages/core/package.json` : le sous-chemin `"./events/*"` y
existe déjà et couvre `@quetzal/core/events/quiz`.

- [ ] **Step 5 : lancer le test pour le voir passer**

```bash
pnpm --filter @quetzal/core exec vitest run src/events/quiz.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: **CODE : 0**, 2 tests verts.

- [ ] **Step 6 : prouver que le contrat fait rougir le compilateur, et non un test**

C'est tout l'objet du motif #53, et un test ne peut pas le montrer : il faut le
typecheck. Sonde jetable :

```bash
cat >> packages/core/src/events/quiz.ts <<'EOF'

// SONDE JETABLE : un champ manquant doit casser la compilation.
export async function sonde(bus: EventBus): Promise<void> {
  await emitQuiz(bus, 'quiz.question.opened', { sessionId: 's', rank: 1 });
}
EOF
node node_modules/typescript/bin/tsc --noEmit --project packages/core/tsconfig.json > /tmp/t.log 2>&1; echo "CODE : $?"
grep -m2 "error TS" /tmp/t.log
```

Expected: **CODE : 1**, avec une erreur nommant `sessionQuestionId` et
`timeLimitResolved` comme manquants. Puis retirer la sonde :

```bash
git checkout -- packages/core/src/events/quiz.ts
node node_modules/typescript/bin/tsc --noEmit --project packages/core/tsconfig.json > /tmp/t.log 2>&1; echo "CODE : $?"
```

Expected: **CODE : 0**.

⛔ Si la sonde compile, la table ne lie rien et le contrat est décoratif :
vérifier que `emitQuiz` est bien générique sur `K extends keyof QuizEventPayloads`
et non sur un `string`.

- [ ] **Step 7 : commit, en deux**

```bash
git add packages/core/src/events/quiz.spec.ts
git commit -m "test(core): exiger un contrat d evenements type pour le quiz

Motif de l issue #53. Vu rouge d abord : Cannot find module './quiz.js'.

Sans table nom -> charge, les interfaces d evenements sont DECORATIVES :
EventBus.emit<T = unknown> laisse T libre et EventName est un gabarit,
donc n importe quel nom avec n importe quelle charge compile. Mesure sur
le loto : quatre interfaces declaraient un tenantId qu AUCUNE emission n
envoyait, pendant des mois, sans que tsc ni aucun test ne le signale."
git add packages/core/src/events/quiz.ts packages/module-quiz/package.json pnpm-lock.yaml
git commit -m "feat(core): le contrat public des evenements du module quiz

Cinq evenements de la spec §7, et emitQuiz pour se faire verifier par le
compilateur.

Verifie par SONDE et non par test, parce qu un test ne peut pas le
montrer : un champ manquant dans un emitQuiz fait echouer tsc. Un vert de
vitest ne prouverait rien ici.

mode est une union fermee alors que le pattern du loto est un string, et
la difference est voulue : les figures du loto sont des cles qui vivent
dans le module, les deux modes du quiz sont une decision de spec stable.

Les dependances WebSocket arrivent ici, volontairement absentes du
plan 1 qui ne contenait aucune seance."
```

---

## Task 2 : le score des deux modes, et les trois propriétés de D7

**Files:**
- Create: `packages/module-quiz/src/domain/session-mode.ts`
- Create: `packages/module-quiz/src/domain/scoring.ts`
- Test: `packages/module-quiz/src/domain/scoring.spec.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`packages/module-quiz/src/domain/scoring.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { BASE, BONUS_MAX, GRACE_MS, pointsPour } from './scoring.js';

/**
 * Spec § 5.3 et D7. Les trois proprietes de D7 sont des TESTS et non des
 * commentaires, parce qu'elles sont exactement ce qu'une formule mal reglee
 * casse en silence : un bareme ou la vitesse prime finit par recompenser le
 * hasard rapide plutot que la connaissance.
 */
describe('pointsPour, mode controle', () => {
  const controle = { mode: 'controle' as const, openedAt: 0, deadlineAt: null };

  it('donne un point pour une reponse juste', () => {
    expect(pointsPour(controle, { isCorrect: true, arriveeMs: 500 })).toBe(1);
  });

  it('donne zero pour une reponse fausse', () => {
    expect(pointsPour(controle, { isCorrect: false, arriveeMs: 500 })).toBe(0);
  });

  /**
   * ⛔ D6 : le mode controle n'a aucun minuteur. Le temps est tout de meme
   * enregistre pour le retour de seance, mais il ne doit peser sur AUCUN score.
   */
  it('ignore completement le temps, meme enorme', () => {
    expect(pointsPour(controle, { isCorrect: true, arriveeMs: 9_000_000 })).toBe(1);
  });
});

describe('pointsPour, mode defi', () => {
  // Vingt secondes, le cas courant.
  const defi = { mode: 'defi' as const, openedAt: 0, deadlineAt: 20_000 };

  it('donne zero pour une reponse fausse, quelle que soit la vitesse', () => {
    expect(pointsPour(defi, { isCorrect: false, arriveeMs: 1 })).toBe(0);
  });

  it('donne BASE plus le bonus plein a une reponse instantanee', () => {
    expect(pointsPour(defi, { isCorrect: true, arriveeMs: 0 })).toBe(BASE + BONUS_MAX);
  });

  it('donne BASE sans bonus a une reponse arrivee pile a l echeance', () => {
    expect(pointsPour(defi, { isCorrect: true, arriveeMs: 20_000 })).toBe(BASE);
  });

  it('donne BASE plus la moitie du bonus a mi-parcours', () => {
    expect(pointsPour(defi, { isCorrect: true, arriveeMs: 10_000 })).toBe(
      BASE + Math.round(BONUS_MAX / 2),
    );
  });

  /**
   * ⛔ PROPRIETE 1 de D7 : juste bat TOUJOURS faux. Si le bonus pouvait
   * depasser BASE, un eleve rapide et faux battrait un eleve lent et juste, et
   * le bareme recompenserait le reflexe plutot que la connaissance.
   */
  it('propriete 1 : la reponse juste la plus LENTE bat la fausse la plus RAPIDE', () => {
    const justeLente = pointsPour(defi, { isCorrect: true, arriveeMs: 20_000 });
    const fausseRapide = pointsPour(defi, { isCorrect: false, arriveeMs: 0 });
    expect(justeLente).toBeGreaterThan(fausseRapide);
  });

  /**
   * ⛔ PROPRIETE 2 de D7 : le bonus est PLAFONNE. Sans plafond, un delai long
   * rendrait l'ecart de vitesse dominant, et deux eleves egaux en connaissance
   * seraient separes par leur reseau.
   */
  it('propriete 2 : le bonus ne depasse jamais BONUS_MAX, meme sur un delai long', () => {
    const longue = { mode: 'defi' as const, openedAt: 0, deadlineAt: 120_000 };
    expect(pointsPour(longue, { isCorrect: true, arriveeMs: 0 })).toBe(BASE + BONUS_MAX);
    expect(BONUS_MAX).toBeLessThan(BASE);
  });

  /**
   * ⛔ PROPRIETE 3 de D7, et spec § 8 point 1 : la GRACE ne rapporte AUCUN
   * bonus. Sinon la marge accordee pour une raison d'accessibilite deviendrait
   * un avantage, et le plancher se retournerait contre son objet.
   */
  it('propriete 3 : une reponse dans la grace vaut BASE, sans bonus', () => {
    expect(pointsPour(defi, { isCorrect: true, arriveeMs: 20_000 + GRACE_MS - 1 })).toBe(BASE);
  });

  it('ne rend jamais de points negatifs, meme tres au-dela de l echeance', () => {
    expect(pointsPour(defi, { isCorrect: true, arriveeMs: 999_999 })).toBe(BASE);
  });

  /**
   * Un delai nul ou une echeance egale a l'ouverture ferait une division par
   * zero. Le reste vaut alors zero, donc BASE sans bonus : refuser serait pire,
   * une question figee ainsi deviendrait injouable en pleine seance.
   */
  it('ne divise pas par zero quand l echeance egale l ouverture', () => {
    const degenere = { mode: 'defi' as const, openedAt: 5_000, deadlineAt: 5_000 };
    expect(pointsPour(degenere, { isCorrect: true, arriveeMs: 5_000 })).toBe(BASE);
  });
});

describe('les constantes', () => {
  it('BONUS_MAX vaut exactement le quart de BASE, comme la spec l impose', () => {
    expect(BONUS_MAX).toBe(BASE / 4);
  });

  it('GRACE_MS reste petite devant le delai le plus court autorise, trois secondes', () => {
    expect(GRACE_MS).toBeLessThan(3_000 / 4);
  });

  /**
   * La grace doit DEPASSER la latence de diffusion mesuree a soixante
   * telephones (215 ms, issue #32), sinon un eleve paie le reseau et non son
   * hesitation. C'est la cartouche du dissident sur D5, partiellement couverte.
   */
  it('GRACE_MS depasse la latence de diffusion mesuree a soixante telephones', () => {
    expect(GRACE_MS).toBeGreaterThan(215);
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/scoring.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -m1 "Cannot find module" /tmp/v.log
```

Expected: **CODE : 1**, `Cannot find module './scoring.js'`.

- [ ] **Step 3 : écrire l'union fermée des modes**

`packages/module-quiz/src/domain/session-mode.ts` :

```ts
export const SESSION_MODES = ['defi', 'controle'] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

export function isSessionMode(valeur: string): valeur is SessionMode {
  return (SESSION_MODES as readonly string[]).includes(valeur);
}
```

- [ ] **Step 4 : écrire le barème**

`packages/module-quiz/src/domain/scoring.ts` :

```ts
import type { SessionMode } from './session-mode.js';

/**
 * Spec § 5.3 : la valeur absolue de `BASE` est sans importance, seul compte le
 * rapport `BONUS_MAX / BASE`. 1000 rend les bonus lisibles à l'unité.
 */
export const BASE = 1000;

/**
 * ⛔ Exactement `BASE / 4`, et c'est la propriété 2 de D7 : le bonus est
 * plafonné bien en dessous de `BASE`, donc une réponse juste et lente bat
 * toujours une réponse fausse et rapide. Augmenter ce rapport ferait du quiz un
 * jeu de réflexe.
 */
export const BONUS_MAX = BASE / 4;

/**
 * Marge de grâce (spec § 8 point 1) : une sélection ou une frappe déjà engagée
 * au moment de la fermeture se valide encore.
 *
 * 500 ms, et le nombre a deux bornes. Il doit **dépasser** la latence de
 * diffusion mesurée à soixante téléphones — 215 ms de médiane, issue #32 — pour
 * qu'un élève ne paie pas le réseau ; et rester **petit** devant le délai le
 * plus court autorisé, trois secondes (spec § 3.3), sinon ce n'est plus une
 * marge mais une rallonge.
 *
 * ⚠️ Il couvre la médiane, pas le p95 du chemin de réponse, qui n'est pas
 * mesuré. C'est une atténuation partielle de la cartouche du dissident sur D5,
 * pas sa résolution.
 */
export const GRACE_MS = 500;

export interface FenetreDeQuestion {
  readonly mode: SessionMode;
  /** Millisecondes depuis l'époque, ou toute base commune avec `arriveeMs`. */
  readonly openedAt: number;
  /** `null` en mode contrôle, qui n'a aucun minuteur (D6). */
  readonly deadlineAt: number | null;
}

export interface ReponseChronometree {
  readonly isCorrect: boolean;
  readonly arriveeMs: number;
}

/**
 * Combien vaut cette réponse. Pure : aucune base, aucune horloge — l'instant
 * d'arrivée est une donnée d'entrée, mesurée côté serveur (D5).
 */
export function pointsPour(
  fenetre: FenetreDeQuestion,
  reponse: ReponseChronometree,
): number {
  if (!reponse.isCorrect) return 0;

  // D6 : le mode contrôle n'a pas de minuteur, donc le temps n'entre dans aucun
  // calcul. Il est tout de même enregistré ailleurs, pour le retour de séance.
  if (fenetre.mode === 'controle' || fenetre.deadlineAt === null) return 1;

  const duree = fenetre.deadlineAt - fenetre.openedAt;
  // Une fenêtre dégénérée ne doit pas diviser par zéro : le reste vaut alors
  // zéro, donc BASE sans bonus. Refuser serait pire, la question deviendrait
  // injouable en pleine séance.
  if (duree <= 0) return BASE;

  const restant = fenetre.deadlineAt - reponse.arriveeMs;
  // `max(0, …)` porte à la fois la grâce et le retard : au-delà de l'échéance
  // le reste est négatif, donc aucun bonus. C'est la propriété 3 de D7, et elle
  // tombe de la formule plutôt que d'un cas particulier à maintenir.
  const reste = Math.max(0, restant / duree);

  return BASE + Math.round(BONUS_MAX * Math.min(1, reste));
}
```

- [ ] **Step 5 : lancer les tests pour les voir passer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/scoring.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: **CODE : 0**, 14 tests verts.

- [ ] **Step 6 : prouver les trois propriétés par mutation**

```bash
cd packages/module-quiz
cp src/domain/scoring.ts /tmp/sc.bak

echo "### M1 : le bonus n est plus plafonne sous BASE"
sed -i "s|export const BONUS_MAX = BASE / 4;|export const BONUS_MAX = BASE * 2;|" src/domain/scoring.ts
cd ../.. && pnpm --filter @quetzal/module-quiz exec vitest run src/domain/scoring.spec.ts > /tmp/v1.log 2>&1; echo "CODE : $?"
grep -cE "^ FAIL" /tmp/v1.log
cp /tmp/sc.bak packages/module-quiz/src/domain/scoring.ts

echo "### M2 : la grace rapporte un bonus"
sed -i "s|  const reste = Math.max(0, restant / duree);|  const reste = Math.abs(restant / duree);|" packages/module-quiz/src/domain/scoring.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/scoring.spec.ts > /tmp/v2.log 2>&1; echo "CODE : $?"
grep -E "propriete 3|negatifs" /tmp/v2.log | head -3
cp /tmp/sc.bak packages/module-quiz/src/domain/scoring.ts

echo "### M3 : le mode controle se met a compter le temps"
sed -i "s|  if (fenetre.mode === 'controle' \|\| fenetre.deadlineAt === null) return 1;|  if (fenetre.deadlineAt === null) return 1;|" packages/module-quiz/src/domain/scoring.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/scoring.spec.ts > /tmp/v3.log 2>&1; echo "CODE : $?"
cp /tmp/sc.bak packages/module-quiz/src/domain/scoring.ts

echo "### restauration"
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/scoring.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: M1 **CODE : 1** avec au moins les deux tests de propriété 1 et 2
rouges ; M2 **CODE : 1** sur « propriete 3 » et « negatifs » ; M3 **CODE : 1**.
Puis **CODE : 0** et 14 verts.

⚠️ Si M3 reste verte, le test « ignore completement le temps » ne garde rien :
c'est que la fenêtre de contrôle du test porte déjà `deadlineAt: null`, donc les
deux branches se confondent. Ajouter alors un cas en mode `controle` **avec** une
échéance non nulle, qui est exactement ce qu'une séance mal figée produirait.

- [ ] **Step 7 : commit, en deux**

```bash
git add packages/module-quiz/src/domain/scoring.spec.ts
git commit -m "test(quiz): exiger les trois proprietes de D7 comme des tests

Spec §5.3 et §9. Vu rouge d abord.

Les trois proprietes de D7 sont des TESTS et non des commentaires, parce
qu elles sont exactement ce qu une formule mal reglee casse en silence :

1. juste bat TOUJOURS faux — la reponse juste la plus lente bat la fausse
   la plus rapide. Sans ca le bareme recompense le reflexe, pas la
   connaissance.
2. le bonus est PLAFONNE — sinon un delai long rend l ecart de vitesse
   dominant, et deux eleves egaux en connaissance sont separes par leur
   reseau.
3. la GRACE ne rapporte AUCUN bonus — sinon la marge accordee pour une
   raison d accessibilite devient un avantage, et le plancher se retourne
   contre son objet.

Trois tests gardent aussi les constantes elles-memes : BONUS_MAX = BASE/4
impose par la spec, et GRACE_MS encadree par DEUX bornes — elle doit
depasser la latence de diffusion mesuree a soixante telephones (215 ms,
#32) et rester petite devant le delai minimum de trois secondes."
git add packages/module-quiz/src/domain/scoring.ts packages/module-quiz/src/domain/session-mode.ts
git commit -m "feat(quiz): le bareme des deux modes

Pure : aucune base, aucune horloge. L instant d arrivee est une DONNEE d
entree, mesuree cote serveur (D5), jamais lue d une horloge ici.

La propriete 3 tombe de la formule plutot que d un cas particulier : le
max(0, restant/duree) porte a la fois la grace et le retard, donc il n y
a aucune branche a maintenir pour que la grace ne rapporte rien.

Verifie par mutation : deplafonner le bonus, mettre une valeur absolue au
reste, ou laisser le mode controle compter le temps font rougir."
```

---

## Task 3 : la résolution du délai au figement

**Files:**
- Create: `packages/module-quiz/src/domain/time-limit.ts`
- Test: `packages/module-quiz/src/domain/time-limit.spec.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`packages/module-quiz/src/domain/time-limit.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { TIME_LIMIT_MAX, TIME_LIMIT_MIN, resoudreLeDelai } from './time-limit.js';

/**
 * D10, et c'est la decision la plus IRREVERSIBLE du document : le delai qui
 * fait foi vit sur la question FIGEE, pas sur la session. La resolution
 * « delai de la question, sinon defaut de session » se fait donc UNE FOIS, au
 * figement, et la valeur resolue est ecrite sur la ligne figee.
 *
 * Si elle se refaisait a chaque lecture, corriger une question en pleine seance
 * changerait le sens des reponses deja donnees.
 */
describe('resoudreLeDelai, mode defi', () => {
  it('prend le delai de la question quand elle en porte un', () => {
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: 45, sessionDefault: 20 }),
    ).toEqual({ kind: 'resolu', seconds: 45 });
  });

  it('retombe sur le defaut de la session quand la question n en porte pas', () => {
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: null, sessionDefault: 20 }),
    ).toEqual({ kind: 'resolu', seconds: 20 });
  });

  /**
   * ⛔ Ni l'un ni l'autre est un REFUS, et non un repli silencieux sur une
   * valeur inventee. Une seance de defi dont une question n'a aucun delai
   * serait injouable, et le decouvrir devant la classe est le pire moment.
   */
  it('refuse quand ni la question ni la session ne donnent de delai', () => {
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: null, sessionDefault: null }),
    ).toEqual({ kind: 'refuse', raison: 'aucun-delai' });
  });

  it('refuse un delai sous le plancher de la spec', () => {
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: TIME_LIMIT_MIN - 1, sessionDefault: 20 }),
    ).toEqual({ kind: 'refuse', raison: 'hors-bornes' });
  });

  it('refuse un delai au-dessus du plafond de la spec', () => {
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: TIME_LIMIT_MAX + 1, sessionDefault: 20 }),
    ).toEqual({ kind: 'refuse', raison: 'hors-bornes' });
  });

  it('accepte les deux bornes elles-memes', () => {
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: TIME_LIMIT_MIN, sessionDefault: null }),
    ).toEqual({ kind: 'resolu', seconds: TIME_LIMIT_MIN });
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: TIME_LIMIT_MAX, sessionDefault: null }),
    ).toEqual({ kind: 'resolu', seconds: TIME_LIMIT_MAX });
  });

  /**
   * ⛔ Le defaut de session hors bornes doit AUSSI etre refuse. Le valider
   * seulement a l'ecriture laisserait passer une valeur ecrite en base avant
   * que la borne existe, ou par une ecriture directe.
   */
  it('refuse un defaut de session hors bornes', () => {
    expect(
      resoudreLeDelai({ mode: 'defi', questionTimeLimit: null, sessionDefault: 500 }),
    ).toEqual({ kind: 'refuse', raison: 'hors-bornes' });
  });
});

describe('resoudreLeDelai, mode controle', () => {
  /**
   * ⛔ D6 : le minuteur n'existe QU'EN mode defi. En controle, le delai resolu
   * est null, et ce n'est pas un refus : c'est l'absence de limite qui fait que
   * WCAG 2.2.1 ne s'applique pas a ce mode (spec §8).
   */
  it('rend null, meme quand la question porte un delai', () => {
    expect(
      resoudreLeDelai({ mode: 'controle', questionTimeLimit: 30, sessionDefault: 20 }),
    ).toEqual({ kind: 'resolu', seconds: null });
  });

  it('rend null sans refuser quand aucun delai n est donne', () => {
    expect(
      resoudreLeDelai({ mode: 'controle', questionTimeLimit: null, sessionDefault: null }),
    ).toEqual({ kind: 'resolu', seconds: null });
  });

  it('ne refuse pas un delai de question hors bornes, puisqu il est ignore', () => {
    expect(
      resoudreLeDelai({ mode: 'controle', questionTimeLimit: 9999, sessionDefault: null }),
    ).toEqual({ kind: 'resolu', seconds: null });
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/time-limit.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -m1 "Cannot find module" /tmp/v.log
```

Expected: **CODE : 1**, `Cannot find module './time-limit.js'`.

- [ ] **Step 3 : écrire la règle**

`packages/module-quiz/src/domain/time-limit.ts` :

```ts
import type { SessionMode } from './session-mode.js';

/** Bornes de la spec § 3.3, en secondes. */
export const TIME_LIMIT_MIN = 3;
export const TIME_LIMIT_MAX = 120;

export interface DemandeDeDelai {
  readonly mode: SessionMode;
  /** Valeur de **rédaction** portée par la question éditable. */
  readonly questionTimeLimit: number | null;
  /** Défaut de la session, valeur de **rédaction** elle aussi (D10). */
  readonly sessionDefault: number | null;
}

export type DelaiResolu =
  | { kind: 'resolu'; seconds: number | null }
  | { kind: 'refuse'; raison: 'aucun-delai' | 'hors-bornes' };

/**
 * Le délai qui fera foi pour une question, résolu **une seule fois**, au
 * figement (D10). La valeur rendue part sur la ligne figée
 * (`Quiz_SessionQuestion.timeLimitResolved`) et plus rien ne la relit ailleurs.
 *
 * ⛔ Refaire cette résolution à chaque lecture ferait qu'une correction de la
 * question en pleine séance changerait le sens des réponses déjà données.
 */
export function resoudreLeDelai(demande: DemandeDeDelai): DelaiResolu {
  // D6 : aucun minuteur en mode contrôle. Ce n'est pas un refus mais une
  // absence de limite, et c'est précisément ce qui fait que WCAG 2.2.1 ne
  // s'applique pas à ce mode (spec § 8).
  if (demande.mode === 'controle') return { kind: 'resolu', seconds: null };

  const choisi = demande.questionTimeLimit ?? demande.sessionDefault;
  // Un refus, et non un repli sur une valeur inventée : une séance de défi dont
  // une question n'a aucun délai est injouable, et le découvrir devant la classe
  // est le pire moment possible.
  if (choisi === null) return { kind: 'refuse', raison: 'aucun-delai' };

  if (choisi < TIME_LIMIT_MIN || choisi > TIME_LIMIT_MAX) {
    return { kind: 'refuse', raison: 'hors-bornes' };
  }
  return { kind: 'resolu', seconds: choisi };
}
```

- [ ] **Step 4 : lancer les tests pour les voir passer**

```bash
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/time-limit.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
grep -E "Tests  " /tmp/v.log
```

Expected: **CODE : 0**, 10 tests verts.

- [ ] **Step 5 : prouver les deux gardes par mutation**

```bash
cd packages/module-quiz && cp src/domain/time-limit.ts /tmp/tl.bak && cd ../..

echo "### M1 : le refus devient un repli silencieux sur 20 s"
sed -i "s|  if (choisi === null) return { kind: 'refuse', raison: 'aucun-delai' };|  if (choisi === null) return { kind: 'resolu', seconds: 20 };|" packages/module-quiz/src/domain/time-limit.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/time-limit.spec.ts > /tmp/v1.log 2>&1; echo "CODE : $?"
grep -E "aucun delai|ni la question" /tmp/v1.log | head -2
cp /tmp/tl.bak packages/module-quiz/src/domain/time-limit.ts

echo "### M2 : le defaut de session echappe aux bornes"
sed -i "s|  const choisi = demande.questionTimeLimit ?? demande.sessionDefault;|  const choisi = demande.questionTimeLimit;\n  if (choisi === null \&\& demande.sessionDefault !== null) return { kind: 'resolu', seconds: demande.sessionDefault };|" packages/module-quiz/src/domain/time-limit.ts
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/time-limit.spec.ts > /tmp/v2.log 2>&1; echo "CODE : $?"
grep -E "defaut de session hors bornes" /tmp/v2.log | head -2
cp /tmp/tl.bak packages/module-quiz/src/domain/time-limit.ts

echo "### restauration"
pnpm --filter @quetzal/module-quiz exec vitest run src/domain/time-limit.spec.ts > /tmp/v.log 2>&1; echo "CODE : $?"
```

Expected: M1 **CODE : 1** sur le test du refus ; M2 **CODE : 1** sur « refuse un
defaut de session hors bornes » ; puis **CODE : 0**.

- [ ] **Step 6 : commit, en deux**

```bash
git add packages/module-quiz/src/domain/time-limit.spec.ts
git commit -m "test(quiz): exiger une resolution du delai faite UNE FOIS, au figement

D10, la decision la plus irreversible de la spec. Vu rouge d abord.

Trois tests portent des pieges qui ne se voient pas :

- ni question ni session ne donne de delai est un REFUS, pas un repli sur
  une valeur inventee : une seance de defi dont une question n a aucun
  delai est injouable, et le decouvrir devant la classe est le pire
  moment.
- le DEFAUT DE SESSION doit aussi passer les bornes. Le valider seulement
  a l ecriture laisserait passer une valeur ecrite avant que la borne
  existe, ou par une ecriture directe en base.
- en mode controle le delai resolu est null et ce n est PAS un refus :
  c est l absence de limite qui fait que WCAG 2.2.1 ne s applique pas a
  ce mode (spec §8)."
git add packages/module-quiz/src/domain/time-limit.ts
git commit -m "feat(quiz): resoudre le delai d une question au figement

La valeur rendue part sur la ligne figee et plus rien ne la relit
ailleurs : refaire la resolution a chaque lecture ferait qu une
correction de question en pleine seance changerait le sens des reponses
deja donnees.

Verifie par mutation : transformer le refus en repli silencieux, ou faire
echapper le defaut de session aux bornes, font rougir."
```

---

> **Suite du plan.** Les tâches 4 à 20 sont dans le second fichier :
> [`2026-11-08-module-quiz-seance-2.md`](./2026-11-08-module-quiz-seance-2.md).
> La coupure est purement matérielle et tombe sur une frontière propre : les
> trois premières tâches livrent le contrat d'événements et les deux règles de
> barème et de délai, toutes pures et testables sans base. Rien de ce qui suit ne
> les modifie.
