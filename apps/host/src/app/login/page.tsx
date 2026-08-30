'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authClient } from '@/lib/auth-client';
import { Button, Card, Input, Label } from '@quetzal/ui';

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const { error: err } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (err) setError(err.message ?? 'Erreur');
    else router.push('/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-2xl font-semibold mb-4">{t('title')}</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="password">{t('password')}</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {t('submit')}
          </Button>
        </form>
      </Card>
    </main>
  );
}
