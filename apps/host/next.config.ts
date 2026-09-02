import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

const config: NextConfig = {
  reactStrictMode: true,
  // Monorepo: pin the tracing root to the workspace, otherwise Next walks up to
  // the first lockfile it finds (e.g. a stray one in $HOME) and traces far too much.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // Prisma loads its query engine (.so.node) by path at runtime, so Next's file tracing
  // never sees it and the Vercel function fails with 'Could not locate the Query Engine'.
  // Force the engine (and the generated client) of the pnpm store into every function.
  outputFileTracingIncludes: {
    '/**/*': ['../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*'],
  },
  async rewrites() {
    return [
      { source: '/api/modules/:path*', destination: `${API}/api/modules/:path*` },
      { source: '/api/guest-token', destination: `${API}/api/guest-token` },
      { source: '/api/audit/:path*', destination: `${API}/api/audit/:path*` },
      { source: '/api/health', destination: `${API}/api/health` },
      { source: '/ws/:path*', destination: `${API}/ws/:path*` },
    ];
  },
  typedRoutes: true,
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(config);
