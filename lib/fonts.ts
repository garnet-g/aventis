/**
 * The fonts a customer can choose for a name or text. Each one has a web font (so the editor looks right) and a
 * print file in assets/fonts (so the printed artwork matches what was on screen).
 */
export type FontKey = 'sans' | 'display' | 'jersey' | 'script' | 'arabic';

export type FontSpec = {
  key: FontKey;
  label: string;
  script: 'latin' | 'arabic';
  /** CSS / print family name. */
  family: string;
  /** CSS weight of the loaded web font. */
  weight: number;
  /** File name inside assets/fonts. */
  file: string;
};

export const FONTS: Record<FontKey, FontSpec> = {
  sans: { key: 'sans', label: 'Classic', script: 'latin', family: 'Noto Sans', weight: 700, file: 'NotoSans-Bold.ttf' },
  display: { key: 'display', label: 'Bold display', script: 'latin', family: 'Bricolage Grotesque', weight: 800, file: 'BricolageGrotesque-ExtraBold.ttf' },
  jersey: { key: 'jersey', label: 'Jersey', script: 'latin', family: 'Bebas Neue', weight: 400, file: 'BebasNeue-Regular.ttf' },
  script: { key: 'script', label: 'Script', script: 'latin', family: 'Pacifico', weight: 400, file: 'Pacifico-Regular.ttf' },
  arabic: { key: 'arabic', label: 'Arabic', script: 'arabic', family: 'Noto Naskh Arabic', weight: 700, file: 'NotoNaskhArabic-Bold.ttf' },
};

export const FONT_KEYS = Object.keys(FONTS) as FontKey[];
export const DEFAULT_FONT: FontKey = 'sans';

/** Anything that is not a known font key (an old CSS font stack, a typo, a non-string) becomes the default. */
export function normalizeFont(value: unknown): FontKey {
  return typeof value === 'string' && Object.hasOwn(FONTS, value) ? (value as FontKey) : DEFAULT_FONT;
}

/** Latin fonts suit left-to-right text; the Arabic font suits right-to-left (Arabic-script) text. */
export function fontsFor(direction: 'ltr' | 'rtl'): FontSpec[] {
  const script = direction === 'rtl' ? 'arabic' : 'latin';
  return FONT_KEYS.map((k) => FONTS[k]).filter((f) => f.script === script);
}

/** The font to actually use: the chosen one when it suits the text, otherwise the first one that does. */
export function resolveFont(value: unknown, direction: 'ltr' | 'rtl'): FontSpec {
  const chosen = FONTS[normalizeFont(value)];
  const suitable = fontsFor(direction);
  return suitable.some((f) => f.key === chosen.key) ? chosen : (direction === 'rtl' ? FONTS.arabic : FONTS[DEFAULT_FONT]);
}
