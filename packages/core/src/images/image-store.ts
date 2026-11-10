export interface StoredImage {
  id: string;
  contentHash: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface CardImageStore {
  /** Rend l image existante si le contenu est déjà stocké : l empreinte déduplique. */
  put(input: { mimeType: string; bytes: Uint8Array }): Promise<StoredImage>;
  findByHash(contentHash: string): Promise<StoredImage | null>;

  /**
   * Supprime les images que plus aucune carte ne reference, et rend leur
   * nombre. Issue #27 : supprimer un jeu laissait ses images en base.
   *
   * ⛔ Un ramassage, et NON une suppression en cascade — la nuance est tout
   * l enjeu. La deduplication par empreinte fait qu une meme image sert
   * plusieurs cartes, dans plusieurs jeux : supprimer « les images du jeu »
   * detruirait l image d un voisin encore vivant.
   */
  deleteOrphans(): Promise<number>;
}
