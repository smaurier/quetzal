import type { EventBus } from '../module-contract.js';

/**
 * Contrat public des événements du module Lotería (`CLAUDE.md` §3 : le type d un
 * événement vit dans le noyau, jamais chez le module).
 *
 * ⚠️ `pattern` est un `string` et non une union fermée, délibérément : les clés
 * de figures vivent dans le module, et le noyau ne doit pas dépendre d un
 * module. C est la seule imprécision assumée de ce fichier.
 */

export interface LotoGameStartedEvent {
  gameId: string;
  deckId: string;
  pattern: string;
  teamCount: number;
}

export interface LotoCardDrawnEvent {
  gameId: string;
  order: number;
  cardId: string;
  label: string;
}

export interface LotoClaimRejectedEvent {
  gameId: string;
  teamId: string;
  atDraw: number;
  blockedUntilDraw: number;
}

export interface LotoGameFinishedEvent {
  gameId: string;
  wonByTeamId: string | null;
  pattern: string;
  drawCount: number;
}

export interface LotoPatternWonEvent {
  gameId: string;
  wonByTeamId: string;
  pattern: string;
  drawCount: number;
}

export const LotoGameStartedEvent = 'LotoGameStartedEvent' as const;
export const LotoCardDrawnEvent = 'LotoCardDrawnEvent' as const;
export const LotoClaimRejectedEvent = 'LotoClaimRejectedEvent' as const;
export const LotoGameFinishedEvent = 'LotoGameFinishedEvent' as const;
export const LotoPatternWonEvent = 'LotoPatternWonEvent' as const;

/**
 * Le nom d un événement lié à la forme de sa charge. Issue #53.
 *
 * Sans cette table, les interfaces ci-dessus étaient décoratives :
 * `EventBus.emit<T = unknown>(name: EventName, payload: T)` laisse `T` libre et
 * `EventName` est un gabarit (`` `${string}.${string}` ``), donc n importe quel
 * nom avec n importe quelle charge compilait. Mesuré le 05/11 : les quatre
 * interfaces déclaraient toutes un `tenantId` qu **aucune émission n envoyait**,
 * pendant des mois, sans que `tsc` ni aucun test ne le signale.
 *
 * Le `tenantId` a été retiré plutôt qu ajouté aux émissions, et c est une
 * décision appuyée sur la lecture du seul consommateur : `persistAudit` dans
 * `apps/api/src/observability/audit.subscriber.ts` fait
 * `p.tenantId ?? ctx?.tenantId ?? null`, donc il se replie sur le contexte
 * d exécution. Et son abonné universel ne persiste que les noms commençant par
 * `audit.security.` : aucun événement `loto.*` n a de consommateur aujourd hui.
 */
export interface LotoEventPayloads {
  'loto.game.started': LotoGameStartedEvent;
  'loto.card.drawn': LotoCardDrawnEvent;
  'loto.claim.rejected': LotoClaimRejectedEvent;
  'loto.game.finished': LotoGameFinishedEvent;
  'loto.pattern.won': LotoPatternWonEvent;
}

/**
 * Émettre un événement Lotería en se faisant vérifier par le compilateur.
 *
 * Préférer ceci à `bus.emit('loto.…', …)` : un nom inconnu, un champ manquant
 * ou un champ en trop ne compile plus. C est la seule différence, et c est tout
 * l objet de l issue #53.
 *
 * Pas de registre central dans le noyau, délibérément : il obligerait chaque
 * module à s enregistrer, ce qui interroge la frontière du §3. Une table par
 * module, dans le contrat public de ce module, suffit et ne couple rien.
 */
export async function emitLoto<K extends keyof LotoEventPayloads>(
  bus: EventBus,
  name: K,
  payload: LotoEventPayloads[K],
): Promise<void> {
  await bus.emit(name, payload);
}
