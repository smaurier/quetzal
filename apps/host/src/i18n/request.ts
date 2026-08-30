import { getRequestConfig } from 'next-intl/server';
import type { AbstractIntlMessages } from 'next-intl';
import { cookies, headers } from 'next/headers';
import { LOCALES, DEFAULT_LOCALE, type Locale } from '@quetzal/i18n';
import frMessages from '@quetzal/i18n/catalogues/fr.json';
import enMessages from '@quetzal/i18n/catalogues/en.json';
import esMessages from '@quetzal/i18n/catalogues/es.json';

const messagesByLocale: Record<Locale, AbstractIntlMessages> = {
  fr: frMessages as AbstractIntlMessages,
  en: enMessages as AbstractIntlMessages,
  es: esMessages as AbstractIntlMessages,
};

function isLocale(value: string | undefined): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
  const acceptLang = (await headers()).get('accept-language');
  const browserLocale = acceptLang?.split(',')[0]?.split('-')[0];
  const locale: Locale = isLocale(cookieLocale)
    ? cookieLocale
    : isLocale(browserLocale)
      ? browserLocale
      : DEFAULT_LOCALE;
  return { locale, messages: messagesByLocale[locale] };
});
