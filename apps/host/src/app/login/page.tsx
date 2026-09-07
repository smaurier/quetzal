'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authClient } from '@/lib/auth-client';
import { Button, Input, Label, QuetzalWordmark } from '@quetzal/ui';
import { LocaleSwitcher } from '@/components/shell/locale-switcher';

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const tBrand = useTranslations('auth.brand');
  const tCommon = useTranslations('common.brand');
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
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Le panneau d'identité est en encre profonde, jamais en jade. C'est le
          seul écran sans client : s'il tenait au vert, il s'effondrerait chez le
          premier établissement qui impose sa charte. Le vert n'est ici qu'une
          ponctuation — l'écran tient par la grecque, le signe et l'échelle. */}
      {/* Le filet de droite n'est pas décoratif : en mode sombre le panneau
          (165 24% 9%) et le fond de page (165 24% 7%) sont quasi identiques, et
          la séparation disparaîtrait sans lui. */}
      <section className="flex flex-col justify-between gap-12 border-border bg-panel p-8 text-panel-foreground lg:border-r lg:p-14">
        <QuetzalWordmark tagline={tCommon('position')} />

        <div className="max-w-md">
          <h1 className="font-display text-display-2 font-semibold">{tBrand('tagline')}</h1>
          <p className="mt-4 text-body-lg text-panel-muted">{tBrand('pitch')}</p>
        </div>

        {/* La grecque, troisième déclinaison : la même marche que le signe,
            mise à plat en filet de séparation de 8 px. Elle n'a pas besoin
            d'être verte non plus — currentColor suffit. */}
        <svg aria-hidden width="100%" height="8" className="text-panel-muted/50">
          <defs>
            <pattern id="quetzal-marche" width="16" height="8" patternUnits="userSpaceOnUse">
              <path d="M0 7h4V4h4V1h4v3h4v3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </pattern>
          </defs>
          <rect width="100%" height="8" fill="url(#quetzal-marche)" />
        </svg>
      </section>

      <section className="flex items-center justify-center p-6 lg:p-14">
        <div className="w-full max-w-sm">
          <p className="font-mono text-micro uppercase text-muted-foreground">{t('space')}</p>
          <h2 className="mt-2 font-display text-h1 font-semibold">{t('title')}</h2>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="font-mono text-label uppercase">
                {t('email')}
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="password" className="font-mono text-label uppercase">
                  {t('password')}
                </Label>
                <a
                  href="/login"
                  className="text-body-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {t('forgot')}
                </a>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error !== null && (
              <p role="alert" className="text-body-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" disabled={pending} className="w-full">
              {t('submit')}
            </Button>
          </form>

          <div className="mt-10 border-t pt-6">
            <LocaleSwitcher />
          </div>
        </div>
      </section>
    </main>
  );
}
