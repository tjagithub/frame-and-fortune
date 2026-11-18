import { counter, gsap, slam, splat, stagger } from "./anim";
import { app, esc } from "./dom";
import { confetti, sfx } from "./fx";
import type { Round } from "./game";
import { setMood } from "./music";
import { studioCue } from "./studio";

export type Result = {
  played: Round[];
  earned: number[];
  score: number;
  max: number;
  rounds: number;
  bonus: number;
  label: string;
  bestKey: string;
  again: () => void;
  menu: () => void;
};

export function rating(score: number, rounds: number): string {
  const f = score / (rounds * 3);
  if (f >= 1) return "Blockbuster";
  if (f >= 0.85) return "Box Office Smash";
  if (f >= 0.7) return "Crowd Pleaser";
  if (f >= 0.55) return "Cult Classic";
  if (f >= 0.4) return "Sleeper Hit";
  if (f >= 0.25) return "Straight to Video";
  return "Lost Reel";
}

let run = 0;

/** Score reveal, then a montage of missed frames with their titles splatted on, then the round list. */
export async function finale(res: Result): Promise<void> {
  const id = ++run;
  const live = () => id === run;
  let skip = false;
  let current: gsap.core.Timeline | null = null;
  const advance = () => void current?.progress(1);
  const onKey = (e: KeyboardEvent) => {
    if (!live()) return window.removeEventListener("keydown", onKey);
    if (e.key === "Escape") skip = true;
    else if (!["Enter", " ", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    advance();
  };
  window.addEventListener("keydown", onKey);

  // One beat = a timeline plus a hold; skipping jumps it to the end, firing its calls.
  const beat = (tl: gsap.core.Timeline, hold: number) =>
    new Promise<void>((resolve) => {
      current = tl;
      tl.to({}, { duration: hold }).eventCallback("onComplete", () => {
        current = null;
        resolve();
      });
    });
  const screen = (cls: string, html: string): HTMLElement => {
    app().innerHTML = `<section class="${cls}">${html}<div class="skip">⏎ next · esc skip</div></section>`;
    const el = app().firstElementChild as HTMLElement;
    el.addEventListener("click", advance);
    return el;
  };

  const best = Number(localStorage.getItem(res.bestKey) ?? 0);
  const isBest = res.score > best;
  if (isBest) localStorage.setItem(res.bestKey, String(res.score));
  const cheer = isBest || res.score >= res.rounds * 3 * 0.7;

  const el = screen(
    "finale",
    `<div class="sub">Final score</div><h1 id="final">0 / ${res.max}</h1><div id="rating" class="rating"></div><p class="muted" id="best"></p>`,
  );
  const final = el.querySelector<HTMLElement>("#final")!;
  const rate = el.querySelector<HTMLElement>("#rating")!;
  const reveal = () => {
    rate.textContent = rating(res.score, res.rounds);
    rate.classList.add("in");
    slam(rate, 0.05);
    el.querySelector("#best")!.textContent = `${isBest ? "New best!" : `Best: ${best}`} · ${res.label}`;
    if (cheer) {
      sfx.fanfare();
      confetti(260);
      studioCue("party");
    }
    setTimeout(() => live() && setMood("fusion"), cheer ? 1600 : 400);
  };
  const scoreTl = gsap.timeline();
  scoreTl.call(() => sfx.drumroll(1.6));
  scoreTl.from(final, { scale: 0.6, opacity: 0, duration: 1.6, ease: "power1.in" });
  scoreTl.add(counter(final, 0, res.score, 0.9, (n) => `${n} / ${res.max}`));
  scoreTl.to(final, { scale: 1.12, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.out" });
  scoreTl.call(reveal);
  await beat(scoreTl, 2.6);

  const missed = res.played.filter((r) => !r.won);
  if (missed.length && !skip && live()) {
    const head = screen("montage", `<div class="slam">What you missed</div>`);
    const headTl = gsap.timeline();
    headTl.call(() => sfx.slam());
    headTl.add(slam(head.querySelector(".slam")!));
    await beat(headTl, 1.1);

    for (const [i, r] of missed.entries()) {
      if (skip || !live()) break;
      const year = r.item.year ? `<small>${r.item.year}</small>` : "";
      const shot = screen(
        "montage",
        `<div class="count">${i + 1} / ${missed.length}</div>
         <div class="shot"><div class="marquee lost"><div class="frame"><img src="${r.frames[0]!.src}"></div></div>
         <div class="splat" hidden><span>${esc(r.item.title)}</span>${year}</div></div>`,
      );
      const blob = shot.querySelector<HTMLElement>(".splat")!;
      const shotTl = gsap.timeline();
      shotTl.from(shot.querySelector(".marquee"), { scale: 0.94, opacity: 0, duration: 0.35, ease: "power2.out" });
      shotTl.from(shot.querySelector(".count"), { y: -10, opacity: 0, duration: 0.25 }, "<");
      await beat(shotTl, 0.6);
      if (skip || !live()) break;
      const splatTl = gsap.timeline();
      splatTl.call(() => {
        blob.hidden = false;
        sfx.splat();
      });
      splatTl.add(splat(blob));
      await beat(splatTl, 1.6);
    }
  }
  if (!live()) return;
  window.removeEventListener("keydown", onKey);
  summary(res, isBest, best);
}

function summary(res: Result, isBest: boolean, best: number): void {
  const rows = res.played.map((r, i) => `<li class="${r.won ? "won" : "lost"}">
      <img src="${r.frames[0]!.src}">
      <span class="n">${i + 1}${i + 1 === res.bonus ? " ×2" : ""}</span>
      <span class="t">${esc(r.item.title)}</span>
      <span class="p">${r.won ? `+${res.earned[i]}` : "—"}</span>
    </li>`).join("");
  app().innerHTML = `<section class="summary">
    <div class="headline"><h1>${res.score} / ${res.max}</h1><div class="rating in">${rating(res.score, res.rounds)}</div></div>
    <p class="muted">${isBest ? "New best!" : `Best: ${best}`} · ${res.label}</p>
    <ul class="rounds">${rows}</ul>
    <div class="row"><button id="again" class="primary big">Play again ⏎</button><button id="menu" class="ghost">Menu</button></div>
  </section>`;
  gsap.from(".summary .headline", { y: -20, opacity: 0, duration: 0.4, ease: "back.out(2)" });
  stagger(".rounds li", 0.15);
  const again = app().querySelector<HTMLButtonElement>("#again")!;
  again.addEventListener("click", () => {
    run++;
    res.again();
  });
  app().querySelector("#menu")!.addEventListener("click", () => {
    run++;
    res.menu();
  });
  again.focus();
}
