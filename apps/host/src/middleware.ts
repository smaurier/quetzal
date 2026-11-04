import { NextResponse, type NextRequest } from 'next/server';
import { FORCED_LOCALE_HEADER, readForcedLocale } from '@/lib/forced-locale';

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  const wsApi = API.replace(/^http/, 'ws');

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self' ${API} ${wsApi}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  // Les composants serveur ne reçoivent pas les paramètres de requête d'une
  // mise en page : le middleware est le seul endroit qui voit l'URL complète
  // avant le rendu. Il transporte, il ne décide pas — la décision reste dans
  // i18n/request.ts.
  // Restreint à /j/ : sans ça, n'importe quelle URL de l'application
  // accepterait ?lang=, tableau de bord compris. Rien ne l'exige.
  if (request.nextUrl.pathname.startsWith('/j/')) {
    const forced = readForcedLocale(request.nextUrl.searchParams.get('lang'));
    if (forced !== null) requestHeaders.set(FORCED_LOCALE_HEADER, forced);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export const config = { matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)' };
