export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: "easy", label: "Half hidden" },
  { id: "medium", label: "Black box" },
  { id: "hard", label: "Mosaic" },
];

/** Mosaic tiles across the frame width; lower is blockier. */
export const MOSAIC_TILES = 36;
/** Share of width and height covered by the medium-difficulty centre panel. */
export const PANEL = 0.65;

async function load(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/** Draws the frame with this difficulty's obstruction and returns it as a data URL. */
export async function obscure(src: string, difficulty: Difficulty): Promise<string> {
  const img = await load(src);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";

  if (difficulty === "hard") {
    const tw = MOSAIC_TILES;
    const th = Math.max(1, Math.round((h / w) * tw));
    const small = document.createElement("canvas");
    small.width = tw;
    small.height = th;
    small.getContext("2d")!.drawImage(img, 0, 0, tw, th);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, w, h);
  } else if (difficulty === "medium") {
    ctx.drawImage(img, 0, 0);
    ctx.fillRect((w * (1 - PANEL)) / 2, (h * (1 - PANEL)) / 2, w * PANEL, h * PANEL);
  } else {
    ctx.drawImage(img, 0, 0);
    const side = Math.floor(Math.random() * 4);
    if (side === 0) ctx.fillRect(0, 0, w / 2, h);
    else if (side === 1) ctx.fillRect(w / 2, 0, w / 2, h);
    else if (side === 2) ctx.fillRect(0, 0, w, h / 2);
    else ctx.fillRect(0, h / 2, w, h / 2);
  }
  return canvas.toDataURL("image/jpeg", 0.88);
}
