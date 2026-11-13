import type { ClientModuleManifest } from '@quetzal/core';

// Bundlé par le host (Next.js) : surface UI seulement, aucun import serveur ici.
export const clientManifest: ClientModuleManifest = {
  slug: 'quiz',
  name: { fr: 'Quiz', en: 'Quiz', es: 'Quiz' },
  uiRoutes: [
    {
      path: '',
      component: () => import('./presentation/ui/banks-page.js'),
      requiredRoles: ['owner', 'creator'],
      layout: 'shell',
    },
    {
      path: ':bankId',
      component: () => import('./presentation/ui/bank-editor.js'),
      requiredRoles: ['owner', 'creator'],
      layout: 'shell',
    },
    {
      path: 'sessions/:sessionId',
      component: () => import('./presentation/ui/host-session.js'),
      requiredRoles: ['owner', 'creator'],
      // Projeté : la coquille mangerait la place du code d'entrée.
      layout: 'full',
    },
  ],
  navItem: {
    icon: 'list-checks',
    labelKey: 'module.quiz.nav.title',
    visibleTo: ['owner', 'creator'],
    order: 30,
  },
};
