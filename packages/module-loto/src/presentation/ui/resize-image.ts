/** Côté le plus long après redimensionnement. Au-delà, on paie du réseau pour rien. */
export const MAX_IMAGE_EDGE = 800;

export function fitWithin(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_IMAGE_EDGE) return { width, height };
  const ratio = MAX_IMAGE_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export async function resizeToDataUrl(file: File): Promise<{ mimeType: string; data: string }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Canvas 2D indisponible');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // WebP avec repli JPEG : Safari a longtemps rendu un PNG quand on lui
  // demandait du WebP, ce qui triplait le poids sans prévenir.
  const webp = canvas.toDataURL('image/webp', 0.82);
  const dataUrl = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.82);

  const [header = '', data = ''] = dataUrl.split(',');
  const mimeType = header.slice(5, header.indexOf(';'));
  return { mimeType, data };
}
