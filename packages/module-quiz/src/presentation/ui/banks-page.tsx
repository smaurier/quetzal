'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient } from '@quetzal/core/client';
import { Button, Card, Input, Label } from '@quetzal/ui';

interface BankSummary {
  id: string;
  name: string;
  isTemplate: boolean;
  questionCount: number;
}

export default function BanksPage() {
  const t = useTranslations();
  const [banks, setBanks] = useState<BankSummary[] | null>(null);
  const [nom, setNom] = useState('');

  async function recharger(): Promise<void> {
    const res = await apiClient().apiFetch('/api/modules/quiz/banks');
    const corps = (await res.json()) as { banks: BankSummary[] };
    setBanks(corps.banks);
  }

  useEffect(() => {
    void recharger();
  }, []);

  async function creer(): Promise<void> {
    if (nom.trim() === '') return;
    await apiClient().apiFetch('/api/modules/quiz/banks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nom }),
    });
    setNom('');
    await recharger();
  }

  return (
    <Card className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">{t('module.quiz.banks.title')}</h1>

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="quiz-new-bank">{t('module.quiz.banks.newName')}</Label>
          <Input
            id="quiz-new-bank"
            value={nom}
            maxLength={120}
            onChange={(event) => setNom(event.target.value)}
          />
        </div>
        <Button onClick={() => void creer()}>{t('module.quiz.banks.create')}</Button>
      </div>

      {banks !== null && banks.length === 0 && <p>{t('module.quiz.banks.empty')}</p>}

      <ul className="flex flex-col gap-2" data-testid="quiz-banks">
        {(banks ?? []).map((bank) => (
          <li key={bank.id} className="flex items-center justify-between rounded border px-4 py-2">
            <span>{bank.name}</span>
            <span>{t('module.quiz.banks.questionCount', { count: bank.questionCount })}</span>
            <a href={`/modules/quiz/${bank.id}`} aria-label={t('module.quiz.banks.open', { name: bank.name })}>
              {t('module.quiz.banks.open', { name: bank.name })}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
