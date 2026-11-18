import { getFrame, type Frame } from "./frames";
import type { Item } from "./library";
import { obscure, type Difficulty } from "./obscure";
import { norm, parseName } from "./titles";

export type Mode = "choice" | "type";
type Step = { text: string } | "frame" | "letters";
/** `view` is the obscured image shown while guessing; `src` is revealed afterwards. */
export type Shown = Frame & { view: string };

export type Round = {
  item: Item;
  path?: string;
  difficulty: Difficulty;
  frames: Shown[];
  used: Set<string>;
  hints: string[];
  ladder: Step[];
  options: Item[];
  wrongIds: Set<string>;
  wrong: number;
  revealed: number;
  order: number[];
  done: boolean;
  won: boolean;
};

export const OPTIONS = 6;
const RECENT_KEY = "ftg.recent";

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const shuffle = <T>(xs: T[]): T[] => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

export const points = (r: Round): number => Math.max(1, 3 - r.wrong);

function recent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function remember(id: string, libSize: number): void {
  const keep = Math.min(50, Math.floor(libSize / 2));
  localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recent().filter((x) => x !== id)].slice(0, keep)));
}

function pickItem(lib: Item[]): Item {
  const seen = new Set(recent());
  const fresh = lib.filter((x) => !seen.has(x.id));
  return pick(fresh.length ? fresh : lib);
}

function ladder(item: Item, path?: string): Step[] {
  const first: Step[] = [];
  if (item.kind === "youtube") {
    if (item.channel) first.push({ text: `Channel: ${item.channel}` });
  } else if (item.kind === "tv") {
    const p = path ? parseName(path) : null;
    const ep = p?.season != null ? ` · S${String(p.season).padStart(2, "0")}E${String(p.episode).padStart(2, "0")}` : "";
    first.push({ text: `TV show${ep}` });
  } else if (item.year) {
    first.push({ text: `Released ${item.year}` });
  }
  return [...first, "frame", { text: `Starts with “${item.title[0]}”` }, "letters"];
}

/** Title with unrevealed letters as underscores; the first `n` positions of `order` are shown. */
export function pattern(title: string, order: number[], n: number): string {
  const show = new Set(order.slice(0, n));
  return [...title].map((c, i) => (/[\p{L}\p{N}]/u.test(c) && !show.has(i) ? "_" : c)).join("");
}

function letterOrder(title: string): number[] {
  const idx = [...title].map((c, i) => (/[\p{L}\p{N}]/u.test(c) ? i : -1)).filter((i) => i >= 0);
  return shuffle(idx);
}

function options(item: Item, lib: Item[]): Item[] {
  const others = lib.filter((x) => x.id !== item.id && x.title !== item.title);
  const same = shuffle(others.filter((x) => x.kind === item.kind));
  const rest = shuffle(others.filter((x) => x.kind !== item.kind));
  return shuffle([item, ...[...same, ...rest].slice(0, OPTIONS - 1)]);
}

const shown = async (f: Frame, d: Difficulty): Promise<Shown> => ({ ...f, view: await obscure(f.src, d) });

export async function newRound(lib: Item[], difficulty: Difficulty): Promise<Round> {
  for (let tries = 0; tries < 5; tries++) {
    const item = pickItem(lib);
    const path = item.paths ? pick(item.paths) : undefined;
    const used = new Set<string>();
    const frame = await getFrame(item, path, used);
    remember(item.id, lib.length);
    if (!frame) continue;
    used.add(frame.key);
    return {
      item, path, used, difficulty, frames: [await shown(frame, difficulty)], hints: [], ladder: ladder(item, path),
      options: options(item, lib), wrongIds: new Set(), wrong: 0,
      revealed: 0, order: letterOrder(item.title), done: false, won: false,
    };
  }
  throw new Error("Couldn't get a usable frame after 5 picks — is ffmpeg installed and the library reachable?");
}

/** Applies the next step of the hint ladder (text, extra frame or more letters). */
export async function nextHint(r: Round): Promise<void> {
  const step = r.ladder.shift() ?? "letters";
  if (step === "frame") {
    const f = await getFrame(r.item, r.path, r.used);
    if (f) {
      r.used.add(f.key);
      r.frames.push(await shown(f, r.difficulty));
      r.hints.push("Another frame");
      return;
    }
    return nextHint(r);
  }
  if (step === "letters") {
    r.revealed = Math.max(r.revealed, 1) + Math.ceil(r.order.length / 5);
    r.hints = r.hints.filter((h) => !h.startsWith("Title: "));
    r.hints.push(`Title: ${pattern(r.item.title, r.order, r.revealed)}`);
    r.ladder.push("letters");
    return;
  }
  r.hints.push(step.text);
}

/** Right answers end the round; wrong ones cost a point (floor of 1) and buy a hint. */
export async function guess(r: Round, it: Item): Promise<boolean> {
  if (r.done) return r.won;
  if (it.id === r.item.id || norm(it.title) === norm(r.item.title)) {
    r.done = r.won = true;
    return true;
  }
  r.wrong++;
  r.wrongIds.add(it.id);
  await nextHint(r);
  return false;
}

export function giveUp(r: Round): void {
  r.done = true;
}
