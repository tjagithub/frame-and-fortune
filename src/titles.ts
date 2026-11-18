export type Parsed = {
  title: string;
  year?: number;
  season?: number;
  episode?: number;
};

const JUNK =
  /\b(2160p|1080p|720p|576p|480p|4k|uhd|hdr(10)?|dv|blu-?ray|brrip|bdrip|web-?dl|web-?rip|webrip|hdtv|dvdrip|dvd|remux|x26[45]|h\.?26[45]|hevc|avc|xvid|divx|aac|ac3|dts|ddp?\d?|atmos|10bit|proper|repack|extended|unrated|remastered|criterion|imax)\b.*$/i;
const EXTRAS = /\b(sample|trailer|featurette|behind the scenes|deleted scenes?|interview)\b/i;
const GENERIC = /^((movie|film|video|title|disc|cd|dvd|episode|season)\s*\d*|\d{1,3})$/i;
const TV = /(?:^|[\s._\-\[(])s(\d{1,2})[\s._-]?e(\d{1,3})|(?:^|[\s._\-\[(])(\d{1,2})x(\d{2,3})(?:$|[\s._\-\])])/i;
const YEAR = /(?:^|[\s._\-(\[])((?:19|20)\d{2})(?=$|[\s._\-)\]])/g;
const SEASON_DIR = /^(season|series|s)\s*\d+$|^specials$/i;

function split(path: string): string[] {
  return path.split(/[\\/]/).filter(Boolean);
}

function stripExt(name: string): string {
  return name.replace(/\.[a-z0-9]{2,4}$/i, "");
}

export function clean(raw: string): string {
  let s = raw
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/[._]+/g, " ")
    .replace(JUNK, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s\-(:]+$/g, "")
    .replace(/^[\s\-)]+/g, "")
    .trim();
  if (s && s === s.toLowerCase()) s = s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  return s;
}

/** Title and year from a film-style name; the last year wins ("2001 A Space Odyssey 1968"). */
function film(name: string): Parsed {
  const years = [...name.matchAll(YEAR)].filter((m) => (m.index ?? 0) > 0 || m[0].length < name.length);
  const last = years.filter((m) => clean(name.slice(0, m.index)).length > 0).at(-1);
  if (!last) return { title: clean(name) };
  return { title: clean(name.slice(0, last.index)), year: Number(last[1]) };
}

function showFromDirs(dirs: string[]): string {
  const named = [...dirs].reverse().find((d) => !SEASON_DIR.test(clean(d)));
  return named ? film(named).title : "";
}

/** Parses a video path into a guessable title; returns null for extras and unusable names. */
export function parseName(path: string): Parsed | null {
  const parts = split(path);
  const file = stripExt(parts.at(-1) ?? "");
  const dirs = parts.slice(0, -1);
  if (EXTRAS.test(file.replace(/[._]/g, " "))) return null;

  const tv = file.match(TV);
  if (tv) {
    const season = Number(tv[1] ?? tv[3]);
    const episode = Number(tv[2] ?? tv[4]);
    let { title, year } = film(file.slice(0, tv.index));
    if (!title || GENERIC.test(title)) title = showFromDirs(dirs);
    return title ? { title, year, season, episode } : null;
  }

  const parsed = film(file);
  if (!parsed.title || GENERIC.test(parsed.title)) {
    const parent = dirs.at(-1);
    if (!parent) return null;
    const fromDir = film(parent);
    if (!fromDir.title) return null;
    return { title: fromDir.title, year: parsed.year ?? fromDir.year };
  }
  if (!parsed.year && dirs.length) {
    const fromDir = film(dirs.at(-1)!);
    if (fromDir.year && norm(fromDir.title) === norm(parsed.title)) parsed.year = fromDir.year;
  }
  return parsed;
}

export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^(the|a|an) /, "")
    .trim();
}
