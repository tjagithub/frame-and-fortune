import { norm } from "./titles";

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

function dice(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  let hit = 0;
  for (const [g, n] of x) hit += Math.min(n, y.get(g) ?? 0);
  const total = [...x.values(), ...y.values()].reduce((s, n) => s + n, 0);
  return total ? (2 * hit) / total : 0;
}

/** 0..100: exact, prefix and substring beat word-prefix hits, which beat typo-tolerant similarity. */
export function score(query: string, title: string): number {
  const q = norm(query);
  const t = norm(title);
  if (!q || !t) return 0;
  if (q === t) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 80;
  const words = q.split(" ");
  const tw = t.split(" ");
  const wordHits = words.filter((w) => tw.some((x) => x.startsWith(w))).length / words.length;
  return Math.max(wordHits * 70, dice(q, t.slice(0, q.length + 4)) * 60, dice(q, t) * 60);
}

export function search<T>(query: string, items: T[], title: (t: T) => string, limit = 8): T[] {
  return items
    .map((it) => ({ it, s: score(query, title(it)) }))
    .filter((r) => r.s >= 25)
    .sort((a, b) => b.s - a.s || title(a.it).localeCompare(title(b.it)))
    .slice(0, limit)
    .map((r) => r.it);
}
