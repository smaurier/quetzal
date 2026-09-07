import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { THEME_COOKIE, colorScheme, readThemePreference, themeClassName } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quetzal',
  description: 'Plateforme éducative interactive',
};

// Statique, et donc adossé à la préférence système plutôt qu'à la nôtre. Lire
// le cookie ici imposerait un <Suspense> autour du <html> ou `instant = false`
// sur cette mise en page — donc un rendu de TOUTES les routes à chaque
// requête. Prix disproportionné pour la couleur d'une barre d'adresse.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'hsl(40 30% 99%)' },
    { media: '(prefers-color-scheme: dark)', color: 'hsl(165 24% 7%)' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const theme = readThemePreference((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang={locale}
      className={themeClassName(theme)}
      style={{ colorScheme: colorScheme(theme) }}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
