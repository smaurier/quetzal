// Better-Auth (jwt plugin, 1.1.x) exposes the JSON Web Key Set at <host>/api/auth/jwks.
export function jwksUrl(hostUrl: string): URL {
  return new URL('/api/auth/jwks', hostUrl.endsWith('/') ? hostUrl : `${hostUrl}/`);
}
