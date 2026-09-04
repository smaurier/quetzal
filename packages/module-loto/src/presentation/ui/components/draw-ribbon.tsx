'use client';
import { CardFace } from './card-face.js';

interface Props {
  draws: { order: number; cardId: string; label: string }[];
}

// aria-label : non visible, hors champ de l interdiction de littéral JSX
// (CLAUDE.md §14 vise le texte affiché ; pas de clé dédiée dans les
// catalogues de la tâche 29 pour ce libellé d assistance technique).
export function DrawRibbon({ draws }: Props) {
  return (
    <ol className="flex gap-2 overflow-x-auto pb-2" aria-label="Cartes déjà sorties">
      {draws.map((draw) => (
        <li key={draw.cardId} className="shrink-0 w-20">
          <CardFace label={draw.label} imageId={null} size="sm" />
        </li>
      ))}
    </ol>
  );
}
