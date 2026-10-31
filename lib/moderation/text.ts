import banned from './banned-words.json';

export type Verdict = 'clear' | 'unsure' | 'explicit';

const norm = (w: string) => w.normalize('NFKC').toLowerCase();
const EXPLICIT = new Set(Object.values(banned.explicit).flat().map(norm));
const AMBIGUOUS = new Set(banned.ambiguous.map(norm));
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;

function tokens(text: string): string[] {
  const cleaned = text.normalize('NFKC').replace(INVISIBLE, '').toLowerCase();
  const parts = cleaned.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  // "f.u.c.k" / "f u c k": join runs of single characters into one token.
  const joined: string[] = [];
  let run = '';
  for (const p of parts) {
    if ([...p].length === 1) run += p;
    else {
      if (run) joined.push(run), (run = '');
      joined.push(p);
    }
  }
  if (run) joined.push(run);
  return [...parts, ...joined];
}

export function moderateText(texts: string[]): Verdict {
  let verdict: Verdict = 'clear';
  for (const t of texts) {
    for (const w of tokens(t)) {
      if (EXPLICIT.has(w)) return 'explicit';
      if (AMBIGUOUS.has(w)) verdict = 'unsure'; // e.g. a real name like Dick: a person decides
    }
  }
  return verdict;
}
