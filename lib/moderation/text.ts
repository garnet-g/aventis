import banned from './banned-words.json';

export type Verdict = 'clear' | 'unsure' | 'explicit';

// Invisible/format characters, joiners, and combining marks (e.g. soft hyphen, hangul filler, ZWNJ, accents)
const IGNORED = /[\p{Cf}\p{Default_Ignorable_Code_Point}\p{M}]/gu;

// Cyrillic and Greek letters that look like Latin ones.
const LOOKALIKES: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', к: 'k', м: 'm', н: 'h', т: 't',
  α: 'a', ε: 'e', ο: 'o', ρ: 'p', ν: 'v', ι: 'i', κ: 'k', τ: 't', υ: 'u',
};
const mapLookalikes = (s: string) => [...s].map((c) => LOOKALIKES[c] ?? c).join('');

const normalize = (s: string) => s.normalize('NFKD').replace(IGNORED, '').toLowerCase();
const normalizeWord = (w: string) => mapLookalikes(normalize(w));

const EXPLICIT = new Set(Object.values(banned.explicit).flat().map(normalizeWord));
const AMBIGUOUS = new Set(banned.ambiguous.map(normalizeWord));
// Long banned words are also matched inside a string with every separator removed ("f u c k i n g").
const LONG_EXPLICIT = [...EXPLICIT].filter((w) => [...w].length >= 5);

const isMixedScript = (part: string) => /[a-z]/.test(part) && /[Ͱ-ϿЀ-ӿ]/.test(part);

function analyse(text: string): { tokens: string[]; squashed: string; mixed: boolean } {
  const parts = normalize(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const mixed = parts.some(isMixedScript);
  const words = parts.map(mapLookalikes);
  // "f.u.c.k": join runs of single characters into one token.
  const joined: string[] = [];
  let run = '';
  for (const w of words) {
    if ([...w].length === 1) run += w;
    else {
      if (run) joined.push(run), (run = '');
      joined.push(w);
    }
  }
  if (run) joined.push(run);
  return { tokens: [...words, ...joined], squashed: words.join(''), mixed };
}

export function moderateText(texts: string[]): Verdict {
  let verdict: Verdict = 'clear';
  for (const t of texts) {
    const { tokens, squashed, mixed } = analyse(t);
    if (tokens.some((w) => EXPLICIT.has(w)) || LONG_EXPLICIT.some((w) => squashed.includes(w))) return 'explicit';
    if (mixed || tokens.some((w) => AMBIGUOUS.has(w))) verdict = 'unsure'; // a person decides
  }
  return verdict;
}
