import { cookies } from 'next/headers';
import { Topbar } from '@/components/shell/topbar';
import { Sidebar } from '@/components/shell/sidebar';
import { THEME_COOKIE, readThemePreference } from '@/lib/theme';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const theme = readThemePreference((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar theme={theme} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
