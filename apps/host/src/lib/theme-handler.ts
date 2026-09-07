import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  THEME_PREFERENCES,
  type ThemePreference,
} from './theme';

const schema = z.object({ theme: z.enum(THEME_PREFERENCES) });

export interface ThemeHandlerDeps {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  updateTheme(userId: string, theme: ThemePreference): Promise<void>;
}

// PATCH /api/user/theme : persiste la préférence de mode dans le cookie, et en
// base quand il y a un compte. Contrairement à /api/user/locale, l'absence de
// session n'est PAS une erreur : la page d'entrée invité n'en a pas.
export function createThemePatchHandler(deps: ThemeHandlerDeps) {
  return async (request: Request): Promise<NextResponse> => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const session = await deps.getSession(request.headers);
    if (session !== null) {
      // Le cookie fait rendre la page ; la base ne fait que la retrouver
      // ailleurs. Un échec de la seconde ne doit pas coûter la première.
      await deps.updateTheme(session.user.id, parsed.data.theme).catch(() => undefined);
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(THEME_COOKIE, parsed.data.theme, {
      path: '/',
      maxAge: THEME_COOKIE_MAX_AGE,
      sameSite: 'lax',
    });
    return response;
  };
}
