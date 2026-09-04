'use client';
import { useState } from 'react';

interface Props {
  label: string;
  imageId: string | null;
  marked?: boolean;
  size: 'sm' | 'lg' | 'xl';
  // `| undefined` explicite : exactOptionalPropertyTypes distingue une prop
  // absente d une prop présente valant undefined, et TablaGrid bascule entre
  // les deux au clic selon `disabled`.
  onClick?: (() => void) | undefined;
}

const SIZES = {
  sm: 'text-sm p-1 min-h-16',
  lg: 'text-2xl p-3 min-h-32',
  xl: 'text-6xl p-8 min-h-64',
} as const;

/**
 * Typographic fallback: a card with no image renders as plain text. The game is
 * thus fully playable before a single image exists, which keeps development
 * independent from artwork production.
 */
export function CardFace({ label, imageId, marked = false, size, onClick }: Props) {
  const Tag = onClick === undefined ? 'div' : 'button';
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = imageId !== null && !imageFailed;
  return (
    <Tag
      type={onClick === undefined ? undefined : 'button'}
      onClick={onClick}
      aria-pressed={onClick === undefined ? undefined : marked}
      className={`flex items-center justify-center rounded-lg border-2 text-center font-semibold transition ${SIZES[size]} ${
        marked ? 'border-primary bg-primary/20' : 'border-border bg-card'
      }`}
    >
      {!showImage ? (
        <span>{label}</span>
      ) : (
        <img
          src={`/api/modules/loto/images/${imageId}`}
          alt={label}
          onError={() => setImageFailed(true)}
          className="max-h-full object-contain"
        />
      )}
    </Tag>
  );
}
