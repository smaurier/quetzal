import type { ClientModuleManifest } from '@quetzal/core';

// Bundlé par le host (Next.js) : surface UI seulement, aucun import serveur ici.
export const clientManifest: ClientModuleManifest = {
  slug: 'loto',
  name: { fr: 'Lotería', en: 'Lotería', es: 'Lotería' },
  uiRoutes: [
    {
      path: '',
      component: () => import('./presentation/ui/decks-page.js'),
      requiredRoles: ['owner', 'creator'],
      layout: 'shell',
    },
    {
      path: 'games/:gameId',
      component: () => import('./presentation/ui/animator-page.js'),
      requiredRoles: ['owner', 'creator'],
      layout: 'shell',
    },
    {
      path: 'decks/:deckId',
      component: () => import('./presentation/ui/deck-editor.js'),
      requiredRoles: ['owner', 'creator'],
      layout: 'shell',
    },
  ],
  navItem: {
    icon: 'grid-3x3',
    labelKey: 'module.loto.nav.title',
    visibleTo: ['owner', 'creator'],
    order: 20,
  },
  guestJoinComponent: () => import('./presentation/ui/guest-join.js'),
};
