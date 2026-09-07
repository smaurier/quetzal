import { describe, it, expect, vi } from 'vitest';
import { createThemePatchHandler } from './theme-handler';
import { THEME_COOKIE } from './theme';

function request(body: unknown): Request {
  return new Request('http://localhost/api/user/theme', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('createThemePatchHandler', () => {
  it('pose le cookie et rend ok pour un utilisateur connecté', async () => {
    const updateTheme = vi.fn().mockResolvedValue(undefined);
    const handler = createThemePatchHandler({
      getSession: async () => ({ user: { id: 'u-1' } }),
      updateTheme,
    });

    const response = await handler(request({ theme: 'dark' }));

    expect(response.status).toBe(200);
    expect(response.cookies.get(THEME_COOKIE)?.value).toBe('dark');
    expect(updateTheme).toHaveBeenCalledWith('u-1', 'dark');
  });

  it("sert un invité sans session : le cookie est posé, la base n'est pas touchée", async () => {
    // C'est LE cas qui distingue ce gestionnaire de celui de la langue. La
    // page /j/[moduleSlug]/[sessionId] n'a pas de session ; un 401 ici
    // priverait de mode sombre tous les élèves arrivés par QR.
    const updateTheme = vi.fn();
    const handler = createThemePatchHandler({
      getSession: async () => null,
      updateTheme,
    });

    const response = await handler(request({ theme: 'dark' }));

    expect(response.status).toBe(200);
    expect(response.cookies.get(THEME_COOKIE)?.value).toBe('dark');
    expect(updateTheme).not.toHaveBeenCalled();
  });

  it('refuse une valeur hors des trois états', async () => {
    const handler = createThemePatchHandler({
      getSession: async () => ({ user: { id: 'u-1' } }),
      updateTheme: async () => undefined,
    });

    const response = await handler(request({ theme: 'sombre' }));

    expect(response.status).toBe(400);
  });

  it("pose quand même le cookie si l'écriture en base échoue", async () => {
    // Le cookie est ce qui fait rendre la page. Perdre la synchronisation
    // entre appareils est un désagrément ; rendre la page dans le mauvais mode
    // parce que la base a hoqueté serait une régression visible.
    const handler = createThemePatchHandler({
      getSession: async () => ({ user: { id: 'u-1' } }),
      updateTheme: async () => {
        throw new Error('base indisponible');
      },
    });

    const response = await handler(request({ theme: 'light' }));

    expect(response.status).toBe(200);
    expect(response.cookies.get(THEME_COOKIE)?.value).toBe('light');
  });
});
