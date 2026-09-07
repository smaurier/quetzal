import type { NewDeckCard } from '../domain/ports/deck.repository.js';

export const TRADITIONAL_DECK_NAME = 'Lotería tradicional';

/**
 * Les cinquante-quatre cartes dans leur ordre canonique, noms seuls.
 * Aucune illustration n est livrée : celles du jeu traditionnel sont protégées.
 * L enseignante duplique ce jeu et y met les photos de son propre exemplaire.
 *
 * Note de contenu, section 7 de la spec : les cartes 26 et 38 portent des noms
 * datés que plusieurs éditions modernes ont changés. Le modèle garde la liste
 * canonique ; la duplication permet de les renommer en un geste.
 */
const LABELS = [
  'El gallo', 'El diablito', 'La dama', 'El catrín', 'El paraguas', 'La sirena',
  'La escalera', 'La botella', 'El barril', 'El árbol', 'El melón', 'El valiente',
  'El gorrito', 'La muerte', 'La pera', 'La bandera', 'El bandolón', 'El violoncello',
  'La garza', 'El pájaro', 'La mano', 'La bota', 'La luna', 'El cotorro',
  'El borracho', 'El negrito', 'El corazón', 'La sandía', 'El tambor', 'El camarón',
  'Las jaras', 'El músico', 'La araña', 'El soldado', 'La estrella', 'El cazo',
  'El mundo', 'El apache', 'El nopal', 'El alacrán', 'La rosa', 'La calavera',
  'La campana', 'El cantarito', 'El venado', 'El sol', 'La corona', 'La chalupa',
  'El pino', 'El pescado', 'La palma', 'La maceta', 'El arpa', 'La rana',
] as const;

export const TRADITIONAL_CARDS: readonly NewDeckCard[] = LABELS.map((label, i) => ({
  rank: i + 1,
  label,
  imageId: null,
}));
