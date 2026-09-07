'use client';
import { CardFace } from './card-face.js';

interface Props {
  cards: { id: string; label: string; imageId: string | null }[];
  markedCardIds: string[];
  onToggle: (cardId: string, marked: boolean) => void;
  disabled: boolean;
}

// Quatre colonnes, seize cases : la grille est la tabla, l ordre du tableau
// est celui de la tabla. Aucun tri ici, sinon la projection en grille du
// domaine et l affichage divergeraient et une figure validée par le serveur
// n aurait pas l air gagnante à l écran.
export function TablaGrid({ cards, markedCardIds, onToggle, disabled }: Props) {
  const marked = new Set(markedCardIds);
  return (
    <div className="grid grid-cols-4 gap-1.5" data-testid="tabla">
      {cards.map((card) => {
        const isMarked = marked.has(card.id);
        return (
          <CardFace
            key={card.id}
            label={card.label}
            imageId={card.imageId}
            marked={isMarked}
            size="lg"
            onClick={disabled ? undefined : () => onToggle(card.id, !isMarked)}
          />
        );
      })}
    </div>
  );
}
