import type { Mode } from "../game";

export type Status = "turn" | "right" | "waiting";

export type PlayerView = { id: string; name: string; score: number; online: boolean; status: Status; gained: number };

export type Option = { id: string; title: string };

/**
 * Host → player. Times are milliseconds remaining, so clocks needn't agree.
 * Big messages (frames) can arrive after later small ones, so turns carry `seq` and frames their index `fi`.
 */
export type ToPlayer =
  | { t: "lobby"; players: PlayerView[]; you: string; mode: Mode }
  | { t: "titles"; items: Option[] }
  | { t: "round"; n: number; of: number; bonus: boolean; frames: string[]; options: Option[] }
  | { t: "turn"; n: number; turn: string; turnName: string; msLeft: number; msTotal: number; hints: string[]; wrong: string[]; worth: number; seq: number; frame?: string; fi?: number; last?: string }
  | { t: "reveal"; n: number; title: string; year?: number; src: string; winner?: string; players: PlayerView[] }
  | { t: "final"; players: PlayerView[] }
  | { t: "ended" };

/** Player → host. */
export type ToHost =
  | { t: "hello"; name: string }
  | { t: "guess"; n: number; id: string }
  | { t: "giveup"; n: number };

export const APP_ID = "frame-the-game.v1";
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const CODE_LEN = 4;

export function newCode(len = CODE_LEN): string {
  const buf = crypto.getRandomValues(new Uint32Array(len));
  return [...buf].map((n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
}

export const cleanCode = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

/** A stable per-device id so reconnecting players keep their score. */
export function deviceId(): string {
  let id = localStorage.getItem("ftg.pid");
  if (!id) {
    id = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("ftg.pid", id);
  }
  return id;
}

export function parse<T>(raw: unknown): T | null {
  try {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as T;
  } catch {
    return null;
  }
}
