/**
 * Helpers for STRATA Lite search: turn a natural question into the key terms
 * to search for ("What is Jito?" → "Jito"), and tell questions apart from lookups.
 */

const STOP = new Set(
  "what whats what's is are was were the a an how do does did i can could should to show me tell about explain list most best popular top which who where when why give find some of for please any".split(" "),
);

export function isQuestion(q: string): boolean {
  const t = q.trim().toLowerCase();
  return /\?$/.test(t) || /^(what|what's|whats|why|how|who|when|where|which|is|are|can|should|does|do|explain|tell me|show me|help)\b/.test(t) || t.split(/\s+/).length >= 6;
}

/** Key terms of a query for the results list. Plain lookups are returned unchanged. */
export function searchTerms(q: string): string {
  const t = q.trim();
  if (!isQuestion(t)) return t;
  const words = t
    .replace(/[?!.,]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()));
  return words.join(" ") || t;
}
