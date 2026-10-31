import type { ImageSafetyProvider } from './image';
import { moderateText, type Verdict } from './text';

export { moderateText, type Verdict } from './text';

const RANK: Record<Verdict, number> = { clear: 0, unsure: 1, explicit: 2 };
const worst = (a: Verdict, b: Verdict): Verdict => (RANK[a] >= RANK[b] ? a : b);

export const EXPLICIT_AT = 0.85;
export const UNSURE_AT = 0.4;

export async function moderateImages(images: Buffer[], provider: ImageSafetyProvider): Promise<Verdict> {
  let verdict: Verdict = 'clear';
  for (const image of images) {
    try {
      const { explicit } = await provider.score(image);
      verdict = worst(verdict, explicit >= EXPLICIT_AT ? 'explicit' : explicit >= UNSURE_AT ? 'unsure' : 'clear');
    } catch {
      verdict = worst(verdict, 'unsure'); // never treat a failed check as clear
    }
  }
  return verdict;
}

export async function moderateDesign(
  input: { texts: string[]; images: Buffer[] },
  provider: ImageSafetyProvider,
): Promise<Verdict> {
  return worst(moderateText(input.texts), await moderateImages(input.images, provider));
}
