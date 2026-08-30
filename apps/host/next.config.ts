import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

const config: NextConfig = {
  reactStrictMode: true,
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
