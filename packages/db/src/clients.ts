import { PrismaClient } from '@prisma/client';

export type RootPrismaClient = PrismaClient & { readonly __brand: 'root' };

let _rootClient: RootPrismaClient | null = null;

export function createRootPrismaClient(): RootPrismaClient {
  if (_rootClient) return _rootClient;
  _rootClient = new PrismaClient() as RootPrismaClient;
  return _rootClient;
}

export const rootPrisma = new Proxy({} as RootPrismaClient, {
  get(_target, prop) {
    const client = createRootPrismaClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});
