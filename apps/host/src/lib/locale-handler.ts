import { NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({ locale: z.enum(['fr', 'en', 'es']) });

export interface LocaleHandlerDeps {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  updateLocale(userId: string, locale: 'fr' | 'en' | 'es'): Promise<void>;
}

// PATCH /api/user/locale: persist the user's locale and pin it in the NEXT_LOCALE cookie.
export function createLocalePatchHandler(deps: LocaleHandlerDeps) {
  return async (request: Request): Promise<NextResponse> => {
    const session = await deps.getSession(request.headers);
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    await deps.updateLocale(session.user.id, parsed.data.locale);

    const response = NextResponse.json({ ok: true });
    response.cookies.set('NEXT_LOCALE', parsed.data.locale, { path: '/', maxAge: 60 * 60 * 24 * 365 });
    return response;
  };
}
