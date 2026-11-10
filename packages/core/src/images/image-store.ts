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

/**
 * Ce qu un module repond quand on lui demande quelles images il utilise encore.
 *
 * Le ramassage vit dans le noyau, mais le noyau ne sait pas lire les tables des
 * modules, et ne doit pas le savoir, sinon ajouter un module exigerait de le
 * modifier. Chaque module repond donc pour lui-meme.
 */
export interface ImageReferenceProvider {
  /** Les `id` d images que ce module reference encore, pour le locataire courant. */
  referencedImageIds(): Promise<readonly string[]>;
}
