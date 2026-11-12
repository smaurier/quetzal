'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient } from '@quetzal/core/client';
import { Button, Card, Input, Label } from '@quetzal/ui';

interface Option {
  id: string;
  rank: number;
  label: string | null;
  imageId: string | null;
  isCorrect: boolean;
}

interface Question {
  id: string;
  rank: number;
  prompt: string;
  imageId: string | null;
  imageAlt: string | null;
  answerMode: 'choix' | 'saisie';
  timeLimit: number | null;
  regles: { accentsSensibles: boolean; casseSensible: boolean };
  options: Option[];
  acceptedAnswers: string[];
}

interface Bank {
  id: string;
  name: string;
  questions: Question[];
}

// Le composant de route ne reçoit que les paramètres captures par le
// manifeste (`:bankId`), typés Readonly<Record<string, string>> par la
// plateforme (voir apps/host/src/app/modules/[slug]/[[...path]]/page.tsx) :
// pas de champ `bankId` garanti au sens du typeur, d où la lecture indexée
// ci-dessous — même pattern que deck-editor.tsx pour `deckId`.
type Props = Readonly<Record<string, string>>;

export default function BankEditor(props: Props) {
  const bankId = props['bankId'];
  const t = useTranslations();
  const [bank, setBank] = useState<Bank | null>(null);

  async function recharger(): Promise<void> {
    if (bankId === undefined) return;
    const res = await apiClient().apiFetch(`/api/modules/quiz/banks/${bankId}`);
    setBank((await res.json()) as Bank);
  }

  useEffect(() => {
    void recharger();
  }, [bankId]);

  async function ajouter(): Promise<void> {
    if (bankId === undefined) return;
    await apiClient().apiFetch(`/api/modules/quiz/banks/${bankId}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Un énoncé non vide est exigé par `addQuestionSchema` (min(1)). Trois
      // points sont la valeur de travail d'une question qu'Elda écrit juste
      // après : ce n'est pas un marqueur à remplacer dans ce plan.
      body: JSON.stringify({ prompt: '...', answerMode: 'choix' }),
    });
    await recharger();
  }

  async function enregistrer(question: Question): Promise<void> {
    if (bankId === undefined) return;
    const corps =
      question.answerMode === 'choix'
        ? {
            prompt: question.prompt,
            timeLimit: question.timeLimit,
            options: question.options.map((o) => ({
              rank: o.rank,
              label: o.label,
              imageId: o.imageId,
              isCorrect: o.isCorrect,
            })),
          }
        : {
            prompt: question.prompt,
            timeLimit: question.timeLimit,
            accentsSensibles: question.regles.accentsSensibles,
            casseSensible: question.regles.casseSensible,
            acceptedAnswers: question.acceptedAnswers,
          };

    await apiClient().apiFetch(`/api/modules/quiz/banks/${bankId}/questions/${question.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    await recharger();
  }

  function modifier(questionId: string, patch: Partial<Question>): void {
    setBank((courant) =>
      courant === null
        ? courant
        : {
            ...courant,
            questions: courant.questions.map((q) => (q.id === questionId ? { ...q, ...patch } : q)),
          });
  }

  async function envoyerImage(question: Question, fichier: File): Promise<void> {
    const octets = new Uint8Array(await fichier.arrayBuffer());
    let binaire = '';
    for (const octet of octets) binaire += String.fromCharCode(octet);

    // Le texte alternatif part AVEC l'image, parce que la route l'exige : une
    // image déjà en base dont l'alternative viendrait « plus tard » reste sans
    // alternative pour toujours.
    await apiClient().apiFetch(`/api/modules/quiz/questions/${question.id}/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mimeType: fichier.type,
        data: btoa(binaire),
        alt: (question.imageAlt ?? '').trim() === '' ? fichier.name : question.imageAlt,
      }),
    });
    await recharger();
  }

  if (bankId === undefined) return null;
  if (bank === null) return <p>{t('module.quiz.banks.empty')}</p>;

  return (
    <Card className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <Label htmlFor="quiz-bank-name">{t('module.quiz.editor.bankName')}</Label>
        <Input id="quiz-bank-name" value={bank.name} readOnly />
      </div>

      <Button onClick={() => void ajouter()}>{t('module.quiz.editor.addQuestion')}</Button>

      <ul className="flex flex-col gap-6" data-testid="quiz-questions">
        {bank.questions.map((question) => (
          <li key={question.id} className="flex flex-col gap-2 rounded border p-4">
            <Label htmlFor={`quiz-prompt-${question.id}`}>
              {t('module.quiz.editor.prompt', { rank: question.rank })}
            </Label>
            <Input
              id={`quiz-prompt-${question.id}`}
              value={question.prompt}
              maxLength={400}
              onChange={(event) => modifier(question.id, { prompt: event.target.value })}
            />

            <Label htmlFor={`quiz-time-${question.id}`}>
              {t('module.quiz.editor.timeLimit', { rank: question.rank })}
            </Label>
            <Input
              id={`quiz-time-${question.id}`}
              type="number"
              min={3}
              max={120}
              value={question.timeLimit ?? ''}
              onChange={(event) =>
                modifier(question.id, {
                  timeLimit: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />

            <Label htmlFor={`quiz-image-${question.id}`}>
              {t('module.quiz.editor.image', { rank: question.rank })}
            </Label>
            <input
              id={`quiz-image-${question.id}`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const fichier = event.target.files?.[0];
                if (fichier !== undefined) void envoyerImage(question, fichier);
              }}
            />

            <Label htmlFor={`quiz-alt-${question.id}`}>
              {t('module.quiz.editor.imageAlt', { rank: question.rank })}
            </Label>
            <Input
              id={`quiz-alt-${question.id}`}
              value={question.imageAlt ?? ''}
              maxLength={200}
              required
              onChange={(event) => modifier(question.id, { imageAlt: event.target.value })}
            />
            {question.imageId !== null && (question.imageAlt ?? '') === '' && (
              <p role="status">{t('module.quiz.editor.imageAltRequis')}</p>
            )}

            {question.answerMode === 'choix' ? (
              <ul className="flex flex-col gap-2">
                {question.options.map((option) => (
                  <li key={option.id} className="flex items-center gap-2">
                    <Label htmlFor={`quiz-option-${option.id}`}>
                      {t('module.quiz.editor.optionLabel', {
                        rank: option.rank,
                        question: question.rank,
                      })}
                    </Label>
                    <Input
                      id={`quiz-option-${option.id}`}
                      value={option.label ?? ''}
                      maxLength={160}
                      onChange={(event) =>
                        modifier(question.id, {
                          options: question.options.map((o) =>
                            o.id === option.id ? { ...o, label: event.target.value } : o),
                        })
                      }
                    />
                    <input
                      type="radio"
                      name={`quiz-correct-${question.id}`}
                      checked={option.isCorrect}
                      aria-label={t('module.quiz.editor.optionCorrect', { rank: option.rank })}
                      onChange={() =>
                        modifier(question.id, {
                          options: question.options.map((o) => ({
                            ...o,
                            isCorrect: o.id === option.id,
                          })),
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <Label htmlFor={`quiz-accepted-${question.id}`}>
                  {t('module.quiz.editor.acceptedAnswers', { rank: question.rank })}
                </Label>
                <Input
                  id={`quiz-accepted-${question.id}`}
                  value={question.acceptedAnswers.join(', ')}
                  onChange={(event) =>
                    modifier(question.id, {
                      acceptedAnswers: event.target.value
                        .split(',')
                        .map((v) => v.trim())
                        .filter((v) => v !== ''),
                    })
                  }
                />
              </>
            )}

            <Button onClick={() => void enregistrer(question)}>
              {t('module.quiz.editor.save')}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
