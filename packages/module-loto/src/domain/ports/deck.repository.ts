export interface DeckCard {
  id: string;
  rank: number;
  label: string;
  imageId: string | null;
}

export interface DeckSummary {
  id: string;
  name: string;
  isTemplate: boolean;
  cardCount: number;
}

export interface Deck extends DeckSummary {
  cards: DeckCard[];
}

export interface NewDeckCard {
  rank: number;
  label: string;
  imageId: string | null;
}

export interface DeckRepository {
  list(): Promise<DeckSummary[]>;
  findById(deckId: string): Promise<Deck | null>;
  create(input: { name: string; isTemplate: boolean; createdBy: string; cards: NewDeckCard[] }): Promise<Deck>;
  rename(deckId: string, name: string): Promise<void>;
  updateCard(deckId: string, rank: number, patch: { label?: string; imageId?: string | null }): Promise<void>;
  delete(deckId: string): Promise<void>;
  /** Vrai si une partie non terminée s appuie sur ce jeu. Verrou de la décision D5. */
  hasUnfinishedGame(deckId: string): Promise<boolean>;
}
