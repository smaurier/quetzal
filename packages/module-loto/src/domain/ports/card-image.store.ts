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
}
