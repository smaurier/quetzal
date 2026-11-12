import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CardImageStore, StoredImage } from '@quetzal/core/images';
import { ManageBankUseCase } from '../application/manage-bank.use-case.js';
import {
  FakeQuestionBankRepository,
  bankOf,
} from '../application/testing/fake-repositories.js';
import { QuizImageController } from './image.controller.js';

/** Doublure écrite à la main : CLAUDE.md §11 interdit `vi.mock`. */
class FakeImageStore implements CardImageStore {
  readonly stockees: StoredImage[] = [];

  async put(input: { mimeType: string; bytes: Uint8Array }): Promise<StoredImage> {
    // Une empreinte stable et lisible, pas un vrai SHA : ce test juge le
    // câblage du contrôleur, pas la fonction de hachage du noyau.
    const image: StoredImage = {
      id: `image-${this.stockees.length + 1}`,
      contentHash: `hash-${input.bytes.length}`,
      mimeType: input.mimeType,
      bytes: input.bytes,
    };
    this.stockees.push(image);
    return image;
  }

  async findByHash(hash: string): Promise<StoredImage | null> {
    return this.stockees.find((image) => image.contentHash === hash) ?? null;
  }

  // Le port en entier, sinon le `implements` ne compile pas. Ce test ne juge
  // pas le ramassage : la tâche 3 s'en charge, contre un vrai Postgres.
  async deleteOrphans(): Promise<number> {
    return 0;
  }
}

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

describe('QuizImageController', () => {
  let images: FakeImageStore;
  let controleur: QuizImageController;
  let banque: FakeQuestionBankRepository;

  beforeEach(() => {
    images = new FakeImageStore();
    banque = new FakeQuestionBankRepository();
    banque.add(bankOf(1));
    controleur = new QuizImageController(images, new ManageBankUseCase(banque));
  });

  it('rend l empreinte du contenu, et non un identifiant de ligne', async () => {
    const questionId = (await banque.findById('bank-1'))!.questions[0]!.id;

    const { imageId } = await controleur.uploadQuestion(questionId, {
      mimeType: 'image/png',
      data: PNG_BASE64,
      alt: 'une chaise en bois',
    });

    expect(imageId).toBe(images.stockees[0]?.contentHash);
  });

  it('attache l image ET son texte alternatif a la question', async () => {
    const questionId = (await banque.findById('bank-1'))!.questions[0]!.id;

    await controleur.uploadQuestion(questionId, {
      mimeType: 'image/png',
      data: PNG_BASE64,
      alt: 'une chaise en bois',
    });

    const question = (await banque.findById('bank-1'))!.questions[0]!;
    expect(question.imageId).toBe(images.stockees[0]?.contentHash);
    expect(question.imageAlt, 'une image sans alternative est un mur').toBe(
      'une chaise en bois');
  });

  it('refuse un type de fichier non image', async () => {
    const questionId = (await banque.findById('bank-1'))!.questions[0]!.id;

    await expect(
      controleur.uploadQuestion(questionId, {
        mimeType: 'application/pdf',
        data: PNG_BASE64,
        alt: 'un pdf',
      })).rejects.toThrow(BadRequestException);
  });

  it('refuse un corps sans texte alternatif', async () => {
    // L alternative n est pas facultative : c est WCAG 1.1.1, et une image
    // servie nue ne laisse aucun recours a l eleve qui ne la voit pas.
    const questionId = (await banque.findById('bank-1'))!.questions[0]!.id;

    await expect(
      controleur.uploadQuestion(questionId, { mimeType: 'image/png', data: PNG_BASE64 })).rejects.toThrow(BadRequestException);
  });

  it('sert une image deja stockee par son empreinte', async () => {
    const stockee = await images.put({
      mimeType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
    });

    const fichier = await controleur.read(stockee.contentHash);

    expect(fichier).toBeDefined();
  });

  it('rend 404 pour une empreinte inconnue, et non une image vide', async () => {
    await expect(controleur.read('empreinte-qui-n-existe-pas')).rejects.toThrow(
      NotFoundException);
  });
});
