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

// Les `typeRef` du manifeste sont vérifiés À L'EXÉCUTION par le test de
// contrat, or une interface s'efface à la compilation : même motif que le loto.
export const QuizSessionStartedEvent = 'QuizSessionStartedEvent' as const;
export const QuizQuestionOpenedEvent = 'QuizQuestionOpenedEvent' as const;
export const QuizAnswerRecordedEvent = 'QuizAnswerRecordedEvent' as const;
export const QuizQuestionClosedEvent = 'QuizQuestionClosedEvent' as const;
export const QuizSessionFinishedEvent = 'QuizSessionFinishedEvent' as const;

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
  payload: QuizEventPayloads[K]): Promise<void> {
  await bus.emit(name, payload);
}
