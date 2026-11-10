'use client';
import { useTranslations } from 'next-intl';
import { Card } from '@quetzal/ui';

export default function BanksPage() {
  const t = useTranslations();
  return (
    <Card className="p-6">
      <h1 className="text-2xl font-bold">{t('module.quiz.banks.title')}</h1>
      <p>{t('module.quiz.banks.empty')}</p>
    </Card>
  );
}
