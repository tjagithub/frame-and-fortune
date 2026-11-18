import { invoke } from "@tauri-apps/api/core";
import { norm, parseName } from "./titles";

export type Kind = "film" | "tv" | "youtube";

export type Item = {
  id: string;
  kind: Kind;
  title: string;
  year?: number;
  channel?: string;
  paths?: string[];
  videoId?: string;
};

export type Sources = { dirs: string[]; youtube: Item[] };

const KEY = "ftg.sources";

export function loadSources(): Sources {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "");
    return { dirs: s.dirs ?? [], youtube: s.youtube ?? [] };
  } catch {
    return { dirs: [], youtube: [] };
  }
}

export function saveSources(s: Sources): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** Groups files into guessable items: one per film (all versions), one per TV show (all episodes). */
export function itemsFromPaths(paths: string[]): Item[] {
  const byKey = new Map<string, Item>();
  for (const path of paths) {
    const p = parseName(path);
    if (!p) continue;
    const kind: Kind = p.season != null ? "tv" : "film";
    const id = kind === "tv" ? `tv:${norm(p.title)}` : `film:${norm(p.title)}:${p.year ?? ""}`;
    const found = byKey.get(id);
    if (found) found.paths!.push(path);
    else byKey.set(id, { id, kind, title: p.title, year: kind === "film" ? p.year : undefined, paths: [path] });
  }
  return [...byKey.values()];
}

export async function scanDirs(dirs: string[]): Promise<Item[]> {
  const all = await Promise.all(dirs.map((dir) => invoke<string[]>("scan_dir", { dir })));
  return itemsFromPaths(all.flat());
}

const URL_ID = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})(?![\w-])/g;
const BARE_ID = /^[\w-]{11}$/;
const DEAD = /^\[(deleted|private) video\]$/i;

/** Video IDs from links, or from bare-ID cells such as a Google Takeout playlist CSV. */
export function extractIds(text: string): string[] {
  const ids = [...text.matchAll(URL_ID)].map((m) => m[1]!);
  for (const cell of text.split(/[\s,;"']+/)) if (BARE_ID.test(cell)) ids.push(cell);
  return [...new Set(ids)];
}

const ytItem = (videoId: string, title: string, channel: string): Item => ({
  id: `yt:${videoId}`,
  kind: "youtube",
  title,
  channel: channel || undefined,
  videoId,
});

async function oembed(id: string): Promise<Item | null> {
  const url = `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`;
  const text = await invoke<string | null>("fetch_text", { url }).catch(() => null);
  if (!text) return null;
  try {
    const j = JSON.parse(text);
    return j.title ? ytItem(id, j.title, j.author_name ?? "") : null;
  } catch {
    return null;
  }
}

async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  const worker = async () => {
    while (next < xs.length) {
      const i = next++;
      out[i] = await f(xs[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, worker));
  return out;
}

/** A playlist URL goes through yt-dlp; anything else is mined for video IDs and titled via oEmbed. */
export async function importYoutube(input: string, browser: string): Promise<Item[]> {
  const text = input.trim();
  if (/^https?:\/\/\S*[?&]list=/.test(text) && !/\s/.test(text)) {
    type Entry = { id: string; title: string; channel: string };
    const entries = await invoke<Entry[]>("yt_playlist", { url: text, browser: browser || null });
    return entries.filter((e) => e.id && e.title && !DEAD.test(e.title)).map((e) => ytItem(e.id, e.title, e.channel));
  }
  const found = await pool(extractIds(text), 8, oembed);
  return found.filter((x): x is Item => x !== null);
}

export function mergeItems(a: Item[], b: Item[]): Item[] {
  const m = new Map(a.map((x) => [x.id, x]));
  for (const x of b) m.set(x.id, x);
  return [...m.values()];
}
