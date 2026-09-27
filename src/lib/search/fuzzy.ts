/** Fuzzy matching primitives for the unified search index. Dependency-free and fast. */

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9$.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function trigrams(s: string): Set<string> {
  const t = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

export function trigramSimilarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

const STOP = new Set(["the", "a", "an", "on", "in", "of", "for", "to", "me", "show", "find", "what", "whats", "what's", "is", "are", "and", "solana", "with", "my", "i", "can", "do", "about"]);

export function queryTerms(q: string): string[] {
  return normalize(q)
    .split(" ")
    .map((w) => w.replace(/^\$/, ""))
    .filter((w) => w && !STOP.has(w));
}

/**
 * Score a document against a query, 0..1.
 * `fields` are ordered by importance: [title, ...secondary]. `keywords` are exact tags.
 */
export function scoreDoc(query: string, title: string, secondary: string[] = [], keywords: string[] = []): number {
  const q = normalize(query);
  if (!q) return 0;
  const t = normalize(title);
  if (t === q) return 1;
  if (t.startsWith(q)) return 0.92 - Math.min(0.1, (t.length - q.length) * 0.005);
  if (t.split(" ").some((w) => w.startsWith(q)) && q.length >= 2) return 0.85;
  if (q.length >= 3 && t.includes(q)) return 0.8;

  const terms = queryTerms(query);
  if (!terms.length) return 0;
  const hay = [t, ...secondary.map(normalize)];
  const kw = keywords.map(normalize);
  let hits = 0;
  let weighted = 0;
  for (const term of terms) {
    let best = 0;
    if (kw.some((k) => k === term || (term.length >= 4 && k.includes(term)))) best = 0.75;
    for (let i = 0; i < hay.length; i++) {
      const field = hay[i];
      const fieldWeight = i === 0 ? 1 : 0.6;
      const words = field.split(" ");
      if (words.includes(term)) best = Math.max(best, 0.8 * fieldWeight);
      else if (term.length >= 3 && words.some((w) => w.startsWith(term))) best = Math.max(best, 0.7 * fieldWeight);
      else if (term.length >= 4 && field.includes(term)) best = Math.max(best, 0.6 * fieldWeight);
      else if (term.length >= 4 && i === 0) {
        // Typo tolerance on the title only: one edit per 4 characters.
        const allowed = Math.floor(term.length / 4);
        if (words.some((w) => Math.abs(w.length - term.length) <= allowed && levenshtein(w, term) <= allowed)) best = Math.max(best, 0.62);
      }
    }
    if (best > 0) hits++;
    weighted += best;
  }
  if (!hits) {
    const sim = trigramSimilarity(q, t);
    return sim > 0.45 ? sim * 0.6 : 0;
  }
  // Reward matching all terms.
  return (weighted / terms.length) * (0.7 + 0.3 * (hits / terms.length));
}
