/**
 * Where module UIs talk to the API.
 * - HTTP keeps going through the host origin ('' = same-origin): Vercel rewrites proxy it and
 *   first-party cookies flow.
 * - WebSockets must hit the API origin directly: Vercel rewrites never proxy upgrades.
 */
export function apiBaseUrl(): string {
  const raw = process.env['NEXT_PUBLIC_API_URL'] ?? '';
  return raw.replace(/\/+$/, '');
}

export function socketUrl(namespace: string): string {
  const ns = namespace.startsWith('/') ? namespace : `/${namespace}`;
  return `${apiBaseUrl()}${ns}`;
}
