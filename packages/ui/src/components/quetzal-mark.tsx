import { cn } from '../lib/utils.js';

// Le nom de la marque ne passe pas par l'i18n : il s'écrit pareil dans les
// trois langues. Le sortir du JSX satisfait `jsx-no-literals` sans inventer une
// clé de traduction qui n'aurait qu'une seule valeur possible.
const BRAND_NAME = 'QUETZAL';

/**
 * Le quetzal, réduit à une grecque en escalier : tête en haut à droite, bec en
 * coin, œil en réserve, puis deux escaliers parallèles qui descendent en
 * diagonale — le corps, puis la queue, plus fine et plus longue.
 *
 * Rien n'est dessiné : tout est en angles droits et 45°. La signature tient à
 * la diagonale et au décalage constant entre les deux escaliers, ce qui rend la
 * forme reproductible à la main sur une grille — le meilleur test de robustesse
 * d'une marque.
 *
 * Un seul aplat, en `currentColor` : le signe hérite de la couleur du texte, il
 * n'a donc pas besoin d'être vert et survit à la charte d'un client.
 */
export function QuetzalMark({
  size = 32,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  // Sous 28 px, l'œil en réserve tomberait à moins de 2 px et se comblerait à
  // l'impression comme au rendu : on le retire plutôt que de le laisser boucher
  // la tête. La silhouette, elle, reste lisible.
  const eye = size >= 28;
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn('block shrink-0', className)}
      role={title === undefined ? 'presentation' : 'img'}
      aria-hidden={title === undefined ? true : undefined}
      aria-label={title}
      focusable="false"
    >
      {title !== undefined && <title>{title}</title>}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d={eye ? 'M20 4h8v1l3 2.5-3 2.5v1H20zM22 6h2.5v2.5H22z' : 'M20 4h8v1l3 2.5-3 2.5v1H20z'}
      />
      <path d="M20 13H14v6H8v5" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M25 17H19v6h-6v6" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

/**
 * Le bloc-marque : le signe, le mot en Archivo 600 interlettré, et la ligne de
 * position. Utilisé sur l'écran de connexion et dans la coquille.
 */
export function QuetzalWordmark({
  tagline,
  className,
}: {
  tagline?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <QuetzalMark size={40} />
      <div>
        <div className="font-display text-h2 font-semibold uppercase tracking-[0.2em]">
          {BRAND_NAME}
        </div>
        {tagline !== undefined && (
          <div className="font-mono text-[0.594rem] uppercase tracking-[0.24em] text-muted-foreground">
            {tagline}
          </div>
        )}
      </div>
    </div>
  );
}
