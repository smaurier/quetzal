import type { ClientModuleManifest } from '@quetzal/core';

// Bundled by the host (Next.js): UI surface only, no server import allowed here.
export const clientManifest: ClientModuleManifest = {
  slug: 'hello',
  name: { fr: 'Hello', en: 'Hello', es: 'Hola' },
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
};
