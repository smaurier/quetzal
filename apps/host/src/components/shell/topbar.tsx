'use client';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { Button } from '@quetzal/ui';
import { LocaleSwitcher } from './locale-switcher';

export function Topbar() {
  const router = useRouter();

  async function logout() {
    await authClient.signOut();
    router.push('/login');
  }

  return (
    <header className="flex h-14 items-center justify-end gap-2 border-b px-4">
      <LocaleSwitcher />
      <Button variant="outline" size="sm" onClick={logout}>
        Logout
      </Button>
    </header>
  );
}
