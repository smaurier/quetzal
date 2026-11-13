import type { QuetzalModuleManifest } from '@quetzal/core';
import { QuizModule } from './quiz.module.js';
import { clientManifest } from './client.js';

export const manifest: QuetzalModuleManifest = {
  ...clientManifest,
  description: {
    fr: 'Quiz jouable en classe',
    en: 'Classroom quiz',
    es: 'Cuestionario para la clase',
  },
  version: '0.1.0',
  contractVersion: '1.0.0',
  enabledByDefault: true,
  apiModule: QuizModule,
  eventsPublished: [
    { name: 'quiz.session.started', typeRef: 'QuizSessionStartedEvent' },
    { name: 'quiz.question.opened', typeRef: 'QuizQuestionOpenedEvent' },
    { name: 'quiz.answer.recorded', typeRef: 'QuizAnswerRecordedEvent' },
    { name: 'quiz.question.closed', typeRef: 'QuizQuestionClosedEvent' },
    { name: 'quiz.session.finished', typeRef: 'QuizSessionFinishedEvent' },
  ],
  permissions: {
    'http:GET /api/modules/quiz/banks': ['owner', 'creator'],
    'http:GET /api/modules/quiz/banks/:id': ['owner', 'creator'],
    'http:POST /api/modules/quiz/banks': ['owner', 'creator'],
    'http:PATCH /api/modules/quiz/banks/:id': ['owner', 'creator'],
    'http:DELETE /api/modules/quiz/banks/:id': ['owner', 'creator'],
    'http:POST /api/modules/quiz/banks/:id/questions': ['owner', 'creator'],
    'http:PATCH /api/modules/quiz/banks/:id/questions/:questionId': ['owner', 'creator'],
    'http:DELETE /api/modules/quiz/banks/:id/questions/:questionId': ['owner', 'creator'],
    'http:GET /api/modules/quiz/images/:hash': ['owner', 'creator', 'learner', 'guest'],
    'http:POST /api/modules/quiz/questions/:questionId/image': ['owner', 'creator'],
    // Piloter la séance est un geste d'animatrice : l'écran est projeté devant
    // la classe, et un élève qui ouvrirait la question suivante jouerait seul.
    'http:GET /api/modules/quiz/sessions': ['owner', 'creator'],
    'http:GET /api/modules/quiz/sessions/:id': ['owner', 'creator'],
    'http:GET /api/modules/quiz/sessions/:id/report': ['owner', 'creator'],
    'http:POST /api/modules/quiz/sessions': ['owner', 'creator'],
    'http:POST /api/modules/quiz/sessions/:id/open': ['owner', 'creator'],
    'http:POST /api/modules/quiz/sessions/:id/start': ['owner', 'creator'],
    'http:POST /api/modules/quiz/sessions/:id/questions/next': ['owner', 'creator'],
    'http:POST /api/modules/quiz/sessions/:id/questions/close': ['owner', 'creator'],
    'http:POST /api/modules/quiz/sessions/:id/finish': ['owner', 'creator'],
    'http:PATCH /api/modules/quiz/sessions/:id/participants/:participantId': ['owner', 'creator'],
    'http:DELETE /api/modules/quiz/sessions/:id': ['owner', 'creator'],
    'ws:answer': ['guest', 'learner'],
  },
  guestAccess: {
    enabled: true,
    tokenTTL: 7200,
    requireDisplayName: true,
    /**
     * ⚠️ EMPRUNTÉ, pas mesuré : 60 vient de la mesure du LOTO (#32, soixante
     * téléphones entrés en 2129 ms, diffusion à 215 ms). Le chemin de réponse
     * du quiz est plus lourd (jusqu'à soixante réponses dans la même seconde,
     * deux écritures chacune), et personne ne l'a mesuré : issue #82, à
     * trancher avant la première séance en classe entière.
     *
     * Et le nombre décide vraiment de qui reste dehors : il est APPLIQUÉ depuis
     * #75 (PR #78), à `POST /api/guest-token`, contre les invités présents. La
     * spec § 7 le dit décoratif, ce n'est plus vrai.
     */
    maxConcurrentPerSession: 60,
  },
  prismaModels: 'prisma/models.prisma',
};
