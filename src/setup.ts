import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { gsap } from "./anim";
import { $, app, esc } from "./dom";
import type { Mode } from "./game";
import { importYoutube, loadSources, mergeItems, saveSources, scanDirs, type Item } from "./library";
import { CODE_LEN, cleanCode } from "./mp/protocol";
import { musicButton, wireMusicButton } from "./music";
import { DIFFICULTIES, type Difficulty } from "./obscure";

type Tools = { ffmpeg: boolean; ffprobe: boolean; ytdlp: boolean };
export type Start = (lib: Item[], mode: Mode, difficulty: Difficulty) => void;
export type Party = { host: Start; join: (code: string) => void };

let files: Item[] = [];
let scanned = "";
const MODE_KEY = "ftg.mode";
const DIFF_KEY = "ftg.difficulty";
const MODES: { id: Mode; label: string }[] = [
  { id: "choice", label: "Multiple choice" },
  { id: "type", label: "Type it" },
];
const TIERS: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

async function rescan(dirs: string[]): Promise<void> {
  const key = dirs.join("\n");
  if (key === scanned) return;
  files = await scanDirs(dirs);
  scanned = key;
}

const seg = (name: string, items: { id: string; label: string; sub?: string }[], on: string): string =>
  `<div class="seg">${items.map((x) => `<label><input type="radio" name="${name}" value="${x.id}" ${x.id === on ? "checked" : ""}>
    <span>${x.sub ? `<small>${x.sub}</small>` : ""}${x.label}</span></label>`).join("")}</div>`;

export async function showSetup(start: Start, party: Party): Promise<void> {
  const src = loadSources();
  const tools = await invoke<Tools>("tools");
  const mode = (localStorage.getItem(MODE_KEY) as Mode) ?? "choice";
  const diff = (localStorage.getItem(DIFF_KEY) as Difficulty) ?? "easy";
  app().innerHTML = `
    <section class="setup">
      ${musicButton()}
      <h1 class="logo"><span>F&amp;F</span><small>Frame and Fortune</small></h1>
      ${!tools.ffmpeg || !tools.ffprobe ? `<p class="warn">ffmpeg/ffprobe not found — local files won't work. <code>brew install ffmpeg</code></p>` : ""}
      <div class="cols">
        <div class="panel lib">
          <h2>Library</h2>
          <ul class="dirs">${src.dirs.map((d, i) => `<li><span>${esc(d)}</span><button data-rm="${i}">✕</button></li>`).join("") || "<li class=muted>No folders yet</li>"}</ul>
          <div class="row"><button id="add-dir">Add folder…</button><span class="muted" id="counts">Scanning…</span></div>
          <details class="yt">
            <summary>YouTube <span class="muted">(${src.youtube.length} videos)</span></summary>
            <p class="muted">A playlist URL (Liked videos: <code>…/playlist?list=LL</code> + browser cookies), or any text with video links / IDs.</p>
            <textarea id="yt" rows="2" placeholder="https://www.youtube.com/playlist?list=…"></textarea>
            <div class="row">
              <label>Cookies <select id="browser">
                ${["", "chrome", "firefox", "safari", "brave", "edge", "chromium", "vivaldi"].map((b) => `<option value="${b}">${b || "none"}</option>`).join("")}
              </select></label>
              <button id="add-yt" ${tools.ytdlp ? "" : `title="yt-dlp is only needed for playlist URLs"`}>Import</button>
              <button id="clear-yt" class="ghost">Clear</button>
              <span class="muted" id="yt-status"></span>
            </div>
          </details>
        </div>
        <div class="panel opts">
          <h2>Mode</h2>
          ${seg("mode", MODES, mode)}
          <h2>Difficulty</h2>
          ${seg("diff", DIFFICULTIES.map((d) => ({ ...d, sub: TIERS[d.id] })), diff)}
        </div>
      </div>
      <div class="cta" id="cta-main">
        <button id="solo" class="primary big" disabled>Solo Play</button>
        <button id="party" class="primary big">Party Play</button>
      </div>
      <div class="cta" id="cta-party" hidden>
        <button id="back" class="ghost back">‹</button>
        <button id="host" class="primary big" disabled>Host Party</button>
        <button id="join" class="primary big">Join Party</button>
      </div>
      <div class="scrim" id="join-pop" hidden>
        <form class="dialog">
          <button type="button" class="ghost close" id="join-close" aria-label="Close">✕</button>
          <h2>Enter code</h2>
          <div class="code-boxes">${Array.from({ length: CODE_LEN }, (_, i) => `<input data-i="${i}" maxlength="1" autocomplete="off" spellcheck="false" inputmode="text">`).join("")}</div>
          <div class="qr-hint"><div class="qr-glyph">▚▞<br>▞▚</div><p class="muted">On a phone? Scan the QR code on the host's screen instead.</p></div>
        </form>
      </div>
    </section>`;

  const refresh = () => showSetup(start, party);
  const library = () => [...files, ...loadSources().youtube];

  app().querySelectorAll<HTMLButtonElement>("[data-rm]").forEach((b) =>
    b.addEventListener("click", () => {
      src.dirs.splice(Number(b.dataset.rm), 1);
      saveSources(src);
      refresh();
    }),
  );
  $("#add-dir").addEventListener("click", async () => {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir !== "string" || src.dirs.includes(dir)) return;
    src.dirs.push(dir);
    saveSources(src);
    refresh();
  });
  $("#add-yt").addEventListener("click", async () => {
    const status = $("#yt-status");
    const input = $<HTMLTextAreaElement>("#yt").value;
    if (!input.trim()) return;
    status.textContent = "Importing…";
    try {
      const got = await importYoutube(input, $<HTMLSelectElement>("#browser").value);
      src.youtube = mergeItems(src.youtube, got);
      saveSources(src);
      await refresh();
      $<HTMLDetailsElement>("details.yt").open = true;
      $("#yt-status").textContent = `Imported ${got.length} videos.`;
    } catch (e) {
      status.textContent = `Import failed: ${e}`;
    }
  });
  $("#clear-yt").addEventListener("click", () => {
    src.youtube = [];
    saveSources(src);
    refresh();
  });

  const go = (fn: Start) => () => {
    const m = $<HTMLInputElement>("input[name=mode]:checked").value as Mode;
    const d = $<HTMLInputElement>("input[name=diff]:checked").value as Difficulty;
    localStorage.setItem(MODE_KEY, m);
    localStorage.setItem(DIFF_KEY, d);
    fn(library(), m, d);
  };
  const swap = (from: string, to: string) => {
    $(from).hidden = true;
    $(to).hidden = false;
    gsap.from(`${to} button`, { y: 20, opacity: 0, duration: 0.3, stagger: 0.06, ease: "back.out(2)" });
  };
  wireMusicButton();
  $("#solo").addEventListener("click", go(start));
  $("#party").addEventListener("click", () => swap("#cta-main", "#cta-party"));
  $("#back").addEventListener("click", () => swap("#cta-party", "#cta-main"));
  $("#host").addEventListener("click", go(party.host));
  wireJoin(party.join);

  try {
    await rescan(src.dirs);
  } catch (e) {
    $("#counts").textContent = `Scan failed: ${e}`;
    return;
  }
  const lib = library();
  const n = (k: Item["kind"]) => lib.filter((x) => x.kind === k).length;
  $("#counts").textContent = `${n("film")} films · ${n("tv")} TV · ${n("youtube")} YouTube`;
  const ok = lib.length >= 2;
  $<HTMLButtonElement>("#solo").disabled = !ok;
  $<HTMLButtonElement>("#host").disabled = !ok;
  if (!ok) $("#counts").textContent += " — add at least 2 to play or host.";
}

/** The join popover: one box per code character, auto-advancing, joining once all are filled. */
function wireJoin(join: (code: string) => void): void {
  const pop = $("#join-pop");
  const boxes = [...pop.querySelectorAll<HTMLInputElement>(".code-boxes input")];
  const close = () => {
    pop.hidden = true;
    removeEventListener("keydown", onEsc);
  };
  const onEsc = (e: KeyboardEvent) => e.key === "Escape" && close();
  const code = () => boxes.map((b) => b.value).join("");
  const fill = (from: number, text: string) => {
    const chars = cleanCode(text).split("");
    let i = from;
    for (const ch of chars) {
      if (i >= boxes.length) break;
      boxes[i++]!.value = ch;
    }
    boxes[Math.min(i, boxes.length - 1)]!.focus();
    if (code().length === CODE_LEN) {
      close();
      join(code());
    }
  };
  $("#join").addEventListener("click", () => {
    pop.hidden = false;
    boxes.forEach((b) => (b.value = ""));
    boxes[0]!.focus();
    addEventListener("keydown", onEsc);
    gsap.from("#join-pop .dialog", { scale: 0.85, opacity: 0, duration: 0.3, ease: "back.out(2.5)" });
  });
  $("#join-close").addEventListener("click", close);
  pop.addEventListener("pointerdown", (e) => e.target === pop && close());
  boxes.forEach((b, i) => {
    b.addEventListener("input", () => {
      const v = b.value;
      b.value = "";
      fill(i, v);
    });
    b.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !b.value && i > 0) {
        boxes[i - 1]!.value = "";
        boxes[i - 1]!.focus();
        e.preventDefault();
      } else if (e.key === "ArrowLeft" && i > 0) boxes[i - 1]!.focus();
      else if (e.key === "ArrowRight" && i < boxes.length - 1) boxes[i + 1]!.focus();
    });
    b.addEventListener("paste", (e) => {
      e.preventDefault();
      fill(i, e.clipboardData?.getData("text") ?? "");
    });
  });
}
