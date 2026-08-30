'use client';
import { createAuthClient, type BetterAuthClientPlugin } from 'better-auth/client';
import { organizationClient } from 'better-auth/client/plugins';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authClient: any = createAuthClient({
  baseURL: '',
  plugins: [organizationClient() as unknown as BetterAuthClientPlugin],
});
