import type { QuetzalModuleManifest } from '@quetzal/core';
import { HelloModule } from './hello.module.js';
import { clientManifest } from './client.js';

export const manifest: QuetzalModuleManifest = {
  ...clientManifest,
  description: {
    fr: 'Module stub pour valider le contrat',
    en: 'Stub module to validate the contract',
    es: 'Módulo stub para validar el contrato',
  },
  version: '0.1.0',
  contractVersion: '1.0.0',
  enabledByDefault: true,
  apiModule: HelloModule,
  eventsPublished: [
    { name: 'hello.greeted', typeRef: 'HelloGreetedEvent' },
    { name: 'hello.pinged', typeRef: 'HelloPingedEvent' },
  ],
  permissions: {
    'http:GET /api/modules/hello/greet': ['owner', 'creator', 'learner'],
    'ws:ping': ['owner', 'creator', 'learner', 'guest'],
  },
  guestAccess: {
    enabled: true,
    tokenTTL: 7200,
    requireDisplayName: true,
    /**
     * ⚠️ Issue #75 : ce plafond est desormais APPLIQUE, a
     * POST /api/guest-token. 100 n a jamais ete mesure, et ne l est pas ici :
     * hello est le squelette de reference, sa passerelle ne fait qu un ping.
     * Le seul plafond adosse a une mesure est celui du loto, 60, mesure par
     * scripts/mesurer-la-charge.mjs. On ne le recopie pas sur hello : ce
     * serait emprunter une mesure faite sur un autre module.
     */
    maxConcurrentPerSession: 100,
  },
  prismaModels: 'prisma/models.prisma',
};
