import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { DEFAULT_FONT, FONT_KEYS, FONTS, fontsFor, normalizeFont, resolveFont } from '@/lib/fonts';

describe('font registry', () => {
  test('offers six fonts: four Latin and two Urdu', () => {
    expect(FONT_KEYS).toEqual(['sans', 'display', 'jersey', 'script', 'nastaliq', 'naskh']);
    expect(Object.values(FONTS).filter((f) => f.script === 'latin')).toHaveLength(4);
    expect(Object.values(FONTS).filter((f) => f.script === 'urdu')).toHaveLength(2);
  });

  test('every font has its print file on disk', () => {
    for (const f of Object.values(FONTS)) {
      expect(existsSync(path.join('assets', 'fonts', f.file)), f.file).toBe(true);
    }
  });

  test('every font has a customer-facing label and a CSS family', () => {
    for (const f of Object.values(FONTS)) {
      expect(f.label.length).toBeGreaterThan(2);
      expect(f.family.length).toBeGreaterThan(2);
    }
  });
});

describe('normalizeFont', () => {
  test('keeps a known key', () => {
    expect(normalizeFont('jersey')).toBe('jersey');
  });

  test('maps anything unknown (such as an old CSS font stack, or a non-string) to the default', () => {
    expect(normalizeFont('"Noto Sans", Arial, sans-serif')).toBe(DEFAULT_FONT);
    expect(normalizeFont(undefined)).toBe(DEFAULT_FONT);
    expect(normalizeFont(42)).toBe(DEFAULT_FONT);
    expect(normalizeFont('__proto__')).toBe(DEFAULT_FONT);
  });
});

describe('fonts by writing direction', () => {
  test('left-to-right text offers Latin fonts, right-to-left offers Urdu fonts', () => {
    expect(fontsFor('ltr').map((f) => f.key)).toEqual(['sans', 'display', 'jersey', 'script']);
    expect(fontsFor('rtl').map((f) => f.key)).toEqual(['nastaliq', 'naskh']);
  });

  test('a font that does not fit the text is swapped for one that does', () => {
    expect(resolveFont('script', 'rtl').key).toBe('nastaliq');
    expect(resolveFont('naskh', 'ltr').key).toBe('sans');
  });

  test('a fitting font is kept', () => {
    expect(resolveFont('jersey', 'ltr').key).toBe('jersey');
    expect(resolveFont('naskh', 'rtl').key).toBe('naskh');
  });
});
