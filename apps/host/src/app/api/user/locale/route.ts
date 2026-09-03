import { auth } from '@quetzal/auth';
import { rootPrisma } from '@quetzal/db';
import { createLocalePatchHandler } from '@/lib/locale-handler';

export const PATCH = createLocalePatchHandler({
  getSession: (headers) => auth.api.getSession({ headers }),
  updateLocale: async (userId, locale) => {
    await rootPrisma.user.update({ where: { id: userId }, data: { locale } });
  },
});
