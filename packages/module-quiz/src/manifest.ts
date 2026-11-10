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
  eventsPublished: [],
  permissions: {},
  prismaModels: 'prisma/models.prisma',
};
