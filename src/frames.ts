import { invoke } from "@tauri-apps/api/core";
import type { Item } from "./library";

/** Reject a frame when this share of pixels is near-black or near-white. */
export const MAX_FLAT = 0.7;
const ATTEMPTS = 6;

export type Frame = { src: string; key: string };

export async function flatShare(src: string): Promise<number> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const w = 160;
  const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let flat = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    if (y < 24 || y > 232) flat++;
  }
  return flat / (w * h);
}

const shuffle = <T>(xs: T[]): T[] => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

/** YouTube's auto-generated thumbnails sit at roughly 25/50/75% and aren't the custom (AI-slop) cover. */
async function youtubeFrame(videoId: string, used: Set<string>): Promise<Frame | null> {
  let fallback: Frame | null = null;
  for (const n of shuffle([1, 2, 3])) {
    for (const size of ["maxres", "sd", "hq", ""]) {
      const key = `${videoId}:${n}`;
      if (used.has(key)) break;
      const src = await invoke<string | null>("fetch_image", { url: `https://i.ytimg.com/vi/${videoId}/${size}${n}.jpg` });
      if (!src) continue;
      if ((await flatShare(src)) <= MAX_FLAT) return { src, key };
      fallback ??= { src, key };
      break;
    }
  }
  return fallback;
}

async function fileFrame(path: string, used: Set<string>): Promise<Frame | null> {
  let best: { f: Frame; flat: number } | null = null;
  for (let i = 0; i < ATTEMPTS; i++) {
    const at = 0.2 + Math.random() * 0.6;
    const key = `${path}:${at.toFixed(3)}`;
    if (used.has(key)) continue;
    let src: string;
    try {
      src = await invoke<string>("grab_frame", { path, fraction: at });
    } catch (e) {
      console.warn("grab_frame", path, e);
      continue;
    }
    const flat = await flatShare(src);
    if (flat <= MAX_FLAT) return { src, key };
    if (!best || flat < best.flat) best = { f: { src, key }, flat };
  }
  return best?.f ?? null;
}

/** A fresh frame for this item that isn't in `used`; files sample the 20-80% range. */
export async function getFrame(item: Item, path: string | undefined, used: Set<string>): Promise<Frame | null> {
  if (item.kind === "youtube") return item.videoId ? youtubeFrame(item.videoId, used) : null;
  return path ? fileFrame(path, used) : null;
}
