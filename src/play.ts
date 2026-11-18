import { $, app, esc } from "./dom";
import { finale } from "./finale";
import { counter, gsap, popPoints, slam, wobble } from "./anim";
import { confetti, isMuted, sfx, shake, toggleMute, wait } from "./fx";
import { musicButton, roundSting, setMood, wireMusicButton } from "./music";
import { search } from "./fuzzy";
import { giveUp, guess, newRound, points, type Mode, type Round } from "./game";
import type { Item } from "./library";
import type { Difficulty } from "./obscure";
import { studioCue } from "./studio";

export const ROUNDS = 10;
/** One surprise Double Feature round lands somewhere in rounds 4-9. */
const BONUS_FROM = 4;
const BONUS_TO = 9;
const MAX = ROUNDS * 3 + 3;

type Session = {
  lib: Item[]; mode: Mode; difficulty: Difficulty; score: number; round: number; bonus: number;
  r?: Round; shown: number; busy: boolean; played: Round[]; earned: number[]; streak: number;
};

let s: Session;
let onMenu: () => void;

export function startGame(lib: Item[], mode: Mode, difficulty: Difficulty, menu: () => void): void {
  const bonus = BONUS_FROM + Math.floor(Math.random() * (BONUS_TO - BONUS_FROM + 1));
  s = { lib, mode, difficulty, score: 0, round: 0, bonus, shown: 0, busy: false, played: [], earned: [], streak: 0 };
  onMenu = menu;
  void next();
}

const bestKey = () => `ftg.best.${s.mode}.${s.difficulty}`;
const label = (it: Item) => it.title;
const isBonus = () => s.round === s.bonus;
const worth = (r: Round) => points(r) * (isBonus() ? 2 : 1);


async function next(): Promise<void> {
  if (s.r) {
    s.played.push(s.r);
    s.earned.push(s.r.won ? worth(s.r) : 0);
  }
  if (s.round >= ROUNDS) return summary();
  s.round++;
  s.r = undefined;
  intro();
  const hold = wait(isBonus() ? 1900 : 1100);
  try {
    const r = await newRound(s.lib, s.difficulty);
    await hold;
    s.r = r;
    s.shown = 0;
  } catch (e) {
    app().innerHTML = `<section class="setup"><p class="warn">${esc(String(e))}</p><button id="menu">Menu</button></section>`;
    $("#menu").addEventListener("click", onMenu);
    return;
  }
  setMood("think");
  render();
}

function intro(): void {
  const card = isBonus()
    ? `<div class="slam bonus">Double Feature</div><div class="sub">Round ${s.round} · points ×2</div>`
    : `<div class="slam">Round ${s.round}</div><div class="sub">of ${ROUNDS}</div>`;
  app().innerHTML = `${header()}<div class="card">${card}</div>`;
  wireHeader();
  const head = $(".card .slam");
  const tl = gsap.timeline();
  tl.add(slam(head, isBonus() ? 0.045 : 0.06));
  tl.from(".card .sub", { y: 12, opacity: 0, duration: 0.3 }, "-=0.15");
  roundSting(isBonus());
  if (isBonus()) {
    studioCue("bonus", 2);
    tl.call(() => void wobble(head));
  }
}

let revealed: Round | null = null;

/** Slams the answer in once per round, not on every re-render. */
function revealOnce(r: Round): void {
  if (!r.done || revealed === r) return;
  revealed = r;
  slam($(".result .title"), 0.025);
  gsap.from(".result .pts", { scale: 0.4, opacity: 0, duration: 0.45, delay: 0.25, ease: "back.out(3)" });
}

async function answer(it: Item): Promise<void> {
  const r = s.r;
  if (!r || r.done || s.busy) return;
  s.busy = true;
  render();
  const before = s.score;
  const right = await guess(r, it);
  s.busy = false;
  if (!right) {
    s.shown = r.frames.length - 1;
    render();
    sfx.wrong();
    studioCue("bad");
    shake(document.querySelector(".marquee"));
    return;
  }
  const gained = worth(r);
  s.score += gained;
  s.streak = r.wrong === 0 ? s.streak + 1 : 0;
  render();
  const frame = $(".marquee");
  sfx.correct(points(r));
  studioCue("good");
  confetti(points(r) >= 3 ? 180 : points(r) === 2 ? 100 : 50);
  popPoints(frame, `+${gained}`);
  await counter($("#score"), before, s.score, 0.7);
}

function header(): string {
  const streak = s.streak >= 2 ? `<span class="streak">🔥 ${s.streak} in a row</span>` : "";
  const tag = isBonus() ? `<span class="tag">Double Feature ×2</span>` : "";
  return `<header>
    <button id="menu" class="ghost">← Menu</button>
    <span class="round">Round <b>${s.round}</b> / ${ROUNDS}</span>${tag}${streak}
    ${musicButton()}
    <button id="mute" class="ghost icon" title="Sound">${isMuted() ? "🔇" : "🔊"}</button>
    <span class="score"><span id="score">${s.score}</span> pts</span>
  </header>`;
}

function wireHeader(): void {
  $("#menu").addEventListener("click", onMenu);
  wireMusicButton();
  $("#mute").addEventListener("click", (e) => {
    toggleMute();
    (e.currentTarget as HTMLElement).textContent = isMuted() ? "🔇" : "🔊";
  });
}

function frames(r: Round): string {
  const pic = (f: Round["frames"][number]) => (r.done ? f.src : f.view);
  const main = r.frames[s.shown] ?? r.frames[0]!;
  const strip = r.frames.length > 1
    ? `<div class="strip">${r.frames.map((f, i) => `<img data-frame="${i}" class="${i === s.shown ? "on" : ""}" src="${pic(f)}">`).join("")}</div>`
    : "";
  const state = r.done ? (r.won ? "won" : "lost") : isBonus() ? "bonus" : "";
  return `<div class="marquee ${state}"><div class="frame"><img src="${pic(main)}"></div></div>${strip}`;
}

function controls(r: Round): string {
  if (r.done) {
    const msg = r.won ? `+${worth(r)}` : "No points this time";
    return `<div class="result ${r.won ? "won" : "lost"}">
      <div class="title">${esc(r.item.title)}${r.item.year ? ` <span class="muted">(${r.item.year})</span>` : ""}</div>
      <div class="pts">${msg}</div>
      <button id="next" class="primary big">${s.round >= ROUNDS ? "Final score" : "Next frame"} ⏎</button>
    </div>`;
  }
  const label2 = `<p class="worth">For <b>${worth(r)}</b> point${worth(r) === 1 ? "" : "s"}${s.busy ? " · fetching hint…" : ""}</p>`;
  if (s.mode === "choice") {
    return `${label2}<div class="choices">${r.options
      .map((o, i) => `<button data-opt="${esc(o.id)}" ${r.wrongIds.has(o.id) || s.busy ? "disabled" : ""}><kbd>${i + 1}</kbd>${esc(label(o))}</button>`)
      .join("")}</div><button id="give-up" class="ghost">Give up</button>`;
  }
  return `${label2}<div class="typer">
      <input id="q" autocomplete="off" spellcheck="false" placeholder="Name that film…" ${s.busy ? "disabled" : ""}>
      <ul id="sugg"></ul>
    </div><button id="give-up" class="ghost">Give up</button>`;
}

function render(): void {
  const r = s.r;
  if (!r) return intro();
  app().innerHTML = `${header()}
    <main class="play">
      ${frames(r)}
      <ul class="hints">${r.hints.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
      ${controls(r)}
    </main>`;
  wireHeader();
  app().querySelectorAll<HTMLImageElement>("[data-frame]").forEach((img) =>
    img.addEventListener("click", () => {
      s.shown = Number(img.dataset.frame);
      render();
    }),
  );
  app().querySelectorAll<HTMLButtonElement>("[data-opt]").forEach((b) =>
    b.addEventListener("click", () => answer(r.options.find((o) => o.id === b.dataset.opt)!)),
  );
  document.getElementById("give-up")?.addEventListener("click", () => {
    giveUp(r);
    s.streak = 0;
    render();
  });
  document.getElementById("next")?.addEventListener("click", () => void next());
  if (r.done) $("#next").focus();
  revealOnce(r);
  if (!r.done && s.mode === "type") wireTyper(r);
}

/** Number keys pick multiple-choice answers. */
window.addEventListener("keydown", (e) => {
  const r = s?.r;
  if (!r || r.done || s.mode !== "choice" || e.metaKey || e.ctrlKey) return;
  const o = r.options[Number(e.key) - 1];
  if (o && !r.wrongIds.has(o.id)) void answer(o);
});

function summary(): void {
  s.r = undefined;
  setMood("off");
  void finale({
    played: s.played, earned: s.earned, score: s.score, max: MAX, rounds: ROUNDS, bonus: s.bonus,
    label: `${s.mode === "choice" ? "multiple choice" : "typed"} · ${s.difficulty}`,
    bestKey: bestKey(),
    again: () => startGame(s.lib, s.mode, s.difficulty, onMenu),
    menu: onMenu,
  });
}

function wireTyper(r: Round): void {
  const q = $<HTMLInputElement>("#q");
  const ul = $("#sugg");
  let hits: Item[] = [];
  let sel = 0;
  const pool = s.lib.filter((x) => !r.wrongIds.has(x.id));
  const draw = () => {
    ul.innerHTML = hits.map((h, i) => `<li data-i="${i}" class="${i === sel ? "sel" : ""}">${esc(label(h))}</li>`).join("");
    ul.querySelectorAll<HTMLLIElement>("li").forEach((li) =>
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        void answer(hits[Number(li.dataset.i)]!);
      }),
    );
  };
  q.addEventListener("input", () => {
    hits = search(q.value, pool, label);
    sel = 0;
    draw();
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") sel = Math.min(sel + 1, hits.length - 1);
    else if (e.key === "ArrowUp") sel = Math.max(sel - 1, 0);
    else if (e.key === "Enter" && hits[sel]) return void answer(hits[sel]!);
    else return;
    e.preventDefault();
    draw();
  });
  q.focus();
}
