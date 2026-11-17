import type { ImageSafetyProvider } from './image';
import { checkText, type Finding, type Verdict } from './text';

export { checkText, moderateText, type Finding, type Verdict } from './text';

const RANK: Record<Verdict, number> = { clear: 0, unsure: 1, explicit: 2 };
const worst = (a: Verdict, b: Verdict): Verdict => (RANK[a] >= RANK[b] ? a : b);

export const EXPLICIT_AT = 0.85;
export const UNSURE_AT = 0.4;
/** Hate, violence, harassment, self-harm and the like never reject on their own: a person looks at them. */
export const OTHER_HARM_AT = 0.5;

const HARM_LABEL: Record<string, string> = {
  hate: 'hate',
  'hate/threatening': 'threatening hate',
  harassment: 'harassment',
  'harassment/threatening': 'threats',
  violence: 'violence',
  'violence/graphic': 'graphic violence',
  'self-harm': 'self-harm',
  illicit: 'illegal activity',
  'illicit/violent': 'weapons or violent crime',
};

/** Scores every picture; explains each one that needs a person or must be refused. */
export async function checkImages(images: Buffer[], provider: ImageSafetyProvider): Promise<Finding> {
  let verdict: Verdict = 'clear';
  const reasons: string[] = [];
  for (const [i, image] of images.entries()) {
    const which = images.length > 1 ? `Picture ${i + 1}` : 'The picture';
    try {
      const { explicit, other = {} } = await provider.score(image);
      if (explicit >= EXPLICIT_AT) {
        verdict = worst(verdict, 'explicit');
        reasons.push(`${which} looks sexually explicit (${Math.round(explicit * 100)}%).`);
      } else if (explicit >= UNSURE_AT) {
        verdict = worst(verdict, 'unsure');
        reasons.push(`${which} may be sexual (${Math.round(explicit * 100)}%).`);
      }
      for (const [category, score] of Object.entries(other)) {
        if (score >= OTHER_HARM_AT && HARM_LABEL[category]) {
          verdict = worst(verdict, 'unsure');
          reasons.push(`${which} may show ${HARM_LABEL[category]} (${Math.round(score * 100)}%).`);
        }
      }
    } catch {
      verdict = worst(verdict, 'unsure'); // never treat a failed check as clear
      reasons.push(`${which} could not be checked automatically.`);
    }
  }
  return { verdict, reasons };
}

export async function moderateImages(images: Buffer[], provider: ImageSafetyProvider): Promise<Verdict> {
  return (await checkImages(images, provider)).verdict;
}

/** The verdict for a whole design, with the reasons a reviewer sees. */
export async function checkDesign(input: { texts: string[]; images: Buffer[] }, provider: ImageSafetyProvider): Promise<Finding> {
  const text = checkText(input.texts);
  const images = await checkImages(input.images, provider);
  return { verdict: worst(text.verdict, images.verdict), reasons: [...text.reasons, ...images.reasons] };
}

export async function moderateDesign(input: { texts: string[]; images: Buffer[] }, provider: ImageSafetyProvider): Promise<Verdict> {
  return (await checkDesign(input, provider)).verdict;
}
