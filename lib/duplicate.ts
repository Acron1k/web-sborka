import levenshtein from 'fast-levenshtein';

export function normalizeTitle(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function findDuplicate(
  titles: { id: string; title: string }[],
  newTitle: string
): { id: string; title: string } | null {
  const norm = normalizeTitle(newTitle);
  if (!norm) return null;
  for (const t of titles) {
    const tn = normalizeTitle(t.title);
    if (tn === norm) return t;
    if (tn.length >= 4 && norm.length >= 4 && (tn.includes(norm) || norm.includes(tn))) return t;
    const dist = levenshtein.get(tn, norm);
    if (dist <= 2 && Math.max(tn.length, norm.length) >= 4) return t;
  }
  return null;
}
