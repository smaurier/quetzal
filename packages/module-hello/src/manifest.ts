import type { QuetzalModuleManifest } from '@quetzal/core';
import { HelloModule } from './hello.module.js';

export const manifest: QuetzalModuleManifest = {
  slug: 'hello',
  name: { fr: 'Hello', en: 'Hello', es: 'Hola' },
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
  uiRoutes: [
    {
      path: '',
      component: () => import('./presentation/ui/hello-page.js'),
      requiredRoles: ['owner', 'creator', 'learner'],
      layout: 'shell',
    },
  ],
  navItem: {
    icon: 'sparkles',
    labelKey: 'module.hello.nav.title',
    visibleTo: ['owner', 'creator', 'learner'],
    order: 10,
  },
  guestJoinComponent: () => import('./presentation/ui/guest-join.js'),
  permissions: {
    'http:GET /api/modules/hello/greet': ['owner', 'creator', 'learner'],
    'ws:ping': ['owner', 'creator', 'learner', 'guest'],
  },
  guestAccess: {
    enabled: true,
    tokenTTL: 7200,
    requireDisplayName: true,
    maxConcurrentPerSession: 100,
  },
  prismaModels: 'prisma/models.prisma',
};
