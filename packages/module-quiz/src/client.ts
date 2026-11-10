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
  ],
  navItem: {
    icon: 'list-checks',
    labelKey: 'module.quiz.nav.title',
    visibleTo: ['owner', 'creator'],
    order: 30,
  },
};
