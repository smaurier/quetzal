import { auth } from '@quetzal/auth';
import { createThemePatchHandler } from '@/lib/theme-handler';

export const PATCH = createThemePatchHandler({
  getSession: (headers) => auth.api.getSession({ headers }),
  // Pas de colonne User.theme : la préférence vit dans le cookie, qui couvre
  // aussi les invités. Voir la tâche 12 du plan si la synchronisation entre
  // appareils devient un besoin.
  updateTheme: async () => undefined,
});
