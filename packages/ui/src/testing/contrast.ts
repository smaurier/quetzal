export interface Hsl {
  readonly h: number;
  readonly s: number;
  readonly l: number;
}

// Les jetons shadcn sont stockés sans `hsl()` ni virgules — « 165 62% 26% » —
// parce que Tailwind les compose en `hsl(var(--x) / <alpha>)`. On lit donc
// cette forme-là, et rien d'autre.
const HSL = /^(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/;

export function parseHsl(value: string): Hsl {
  const match = HSL.exec(value.trim());
  if (match === null) throw new Error(`Valeur HSL illisible : « ${value} »`);
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

function hslToRgb({ h, s, l }: Hsl): readonly [number, number, number] {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hue = (((h % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((hue % 2) - 1));
  const offset = lightness - chroma / 2;
  const sectors: readonly (readonly [number, number, number])[] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ];
  const sector = sectors[Math.floor(hue) % 6] ?? sectors[0]!;
  return [sector[0] + offset, sector[1] + offset, sector[2] + offset];
}

function relativeLuminance(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hslToRgb(parseHsl(a)));
  const lb = relativeLuminance(hslToRgb(parseHsl(b)));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
