import { createAuthClient, type BetterAuthClientPlugin } from 'better-auth/client';
import { organizationClient } from 'better-auth/client/plugins';

// Better-Auth's `createAuthClient` returns a type that transitively references pnpm-virtual
// paths (nanostores, undici-types) which TS cannot name in an emitted .d.ts. We erase the
// public type here; T22 (real client wiring) will provide typed wrappers per call-site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authClient: any = createAuthClient({
  baseURL: process.env['NEXT_PUBLIC_HOST_URL'] ?? '',
  plugins: [organizationClient() as unknown as BetterAuthClientPlugin],
});
