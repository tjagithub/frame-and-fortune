import QRCode from "qrcode";
import { gsap, slam, stagger, wobble } from "../anim";
import { app, esc } from "../dom";
import { confetti, sfx } from "../fx";
import { musicButton, roundSting, setMood, wireMusicButton } from "../music";
import { studioCue } from "../studio";
import { search } from "../fuzzy";
import { HOST, ROUNDS, TURN_MS, type Party } from "./host";
import type { Option, PlayerView } from "./protocol";

export type Controls = {
  start: () => void; next: () => void; skip: () => void; lobby: () => void; quit: () => void;
  guess: (id: string) => void; pass: () => void; titles: Option[]; views: () => PlayerView[];
};

const STATUS: Record<PlayerView["status"], string> = { turn: "🎤", right: "✅", waiting: "" };

/** Sound and studio lights for a missed turn; the screen itself is redrawn by render. */
export function cue(kind: "miss" | "turn"): void {
  if (kind === "miss") {
    sfx.wrong();
    studioCue("bad");
  } else sfx.slam();
}
let qr: { url: string; src: string } | null = null;
let shown = "";

function header(p: Party, c: Controls): string {
  const round = p.phase === "lobby" ? "Lobby" : p.phase === "final" ? "Final" : `Round <b>${p.n}</b> / ${ROUNDS}`;
  return `<header>
    <button id="quit" class="ghost">✕ End party</button>
    <span class="round">${round}</span>
    ${p.n === p.bonus && p.phase !== "lobby" && p.phase !== "final" ? `<span class="tag">Double Feature ×2</span>` : ""}
    <span class="code-chip">Code <b>${p.code}</b></span>
    ${musicButton()}
    <span class="score">${c.views().filter((v) => v.online).length} playing</span>
  </header>`;
}

function chips(players: PlayerView[], reveal = false): string {
  return `<ul class="chips">${players.map((v) => `<li class="${v.online ? "" : "off"} ${v.status}">
      <span class="nm">${esc(v.name)}</span>
      <span class="st">${reveal ? (v.gained ? `+${v.gained}` : "—") : STATUS[v.status]}</span>
      <span class="sc">${v.score}</span>
    </li>`).join("") || `<li class="empty">Waiting for players…</li>`}</ul>`;
}

async function qrFor(url: string): Promise<string> {
  if (qr?.url !== url) qr = { url, src: await QRCode.toDataURL(url, { margin: 1, width: 300, color: { dark: "#0e0f13", light: "#ffffff" } }) };
  return qr.src;
}

function wire(c: Controls): void {
  app().querySelector("#quit")?.addEventListener("click", c.quit);
  wireMusicButton();
  app().querySelector("#start")?.addEventListener("click", c.start);
  app().querySelector("#next")?.addEventListener("click", c.next);
  app().querySelector("#skip")?.addEventListener("click", c.skip);
  app().querySelector("#again")?.addEventListener("click", c.start);
  app().querySelector("#lobby")?.addEventListener("click", c.lobby);
}

export function intro(p: Party, c: Controls): void {
  const bonus = p.n === p.bonus;
  const card = bonus
    ? `<div class="slam bonus">Double Feature</div><div class="sub">Round ${p.n} · points ×2</div>`
    : `<div class="slam">Round ${p.n}</div><div class="sub">of ${ROUNDS}</div>`;
  app().innerHTML = `${header(p, c)}<div class="card">${card}</div>`;
  wire(c);
  shown = `intro${p.n}`;
  const head = app().querySelector(".card .slam")!;
  const tl = gsap.timeline().add(slam(head, bonus ? 0.045 : 0.06));
  roundSting(bonus);
  if (bonus) {
    studioCue("bonus", 2);
    tl.call(() => void wobble(head));
  }
}

/** Re-renders the current phase; entrance animations run only when the phase or round changes. */
export async function render(p: Party, c: Controls): Promise<void> {
  if (p.phase === "intro") return;
  const key = `${p.phase}${p.n}${p.phase === "round" ? `:${p.turn}:${p.misses}` : ""}`;
  const fresh = key !== shown;
  shown = key;
  const players = c.views();

  if (p.phase === "lobby") {
    const src = p.lanUrl ? await qrFor(p.lanUrl) : null;
    app().innerHTML = `${header(p, c)}<section class="lobby">
      <div class="join">
        <div class="how">
          <h2>Phones on this Wi-Fi</h2>
          ${src ? `<img class="qr" src="${src}"><p class="muted url">${esc(p.lanUrl!)}</p>` : `<p class="warn">LAN unavailable: ${esc(p.lanError ?? "")}</p>`}
        </div>
        <div class="how">
          <h2>Online — open Frame and Fortune › Join Party</h2>
          <div class="big-code">${p.code}</div>
          <p class="muted">Only people with this code can join.</p>
        </div>
      </div>
      ${chips(players)}
      <div class="row center"><button id="start" class="primary big" ${players.length ? "" : "disabled"}>Start the show</button></div>
    </section>`;
    wire(c);
    if (fresh) gsap.from(".lobby .big-code", { scale: 0.6, opacity: 0, duration: 0.5, ease: "back.out(2.5)" });
    return;
  }

  if (p.phase === "final") {
    const top = players[0];
    app().innerHTML = `${header(p, c)}<section class="board">
      <div class="sub">And the winner is…</div>
      <h1 class="winner">${esc(top?.name ?? "Nobody")}</h1>
      <h2 class="hof">Hall of Frame</h2>
      <ol class="standings">${players.map((v, i) => `<li><span class="rk">${i + 1}</span><span class="nm">${esc(v.name)}</span><span class="sc">${v.score}</span></li>`).join("")}</ol>
      <div class="row center"><button id="again" class="primary big">Play again</button><button id="lobby" class="ghost">Back to lobby</button></div>
    </section>`;
    wire(c);
    if (fresh) {
      sfx.drumroll(1.4);
      gsap.timeline()
        .from(".board .winner", { opacity: 0, duration: 0.01 }, 1.4)
        .add(slam(app().querySelector(".board .winner")!, 0.06), 1.4)
        .call(() => {
          sfx.fanfare();
          confetti(300);
          studioCue("party");
          setTimeout(() => setMood("fusion"), 1600);
        })
        .add(stagger(".standings li"), "+=0.2");
    }
    return;
  }

  const r = p.r!;
  const reveal = p.phase === "reveal";
  const img = reveal ? r.frames[0]!.src : r.frames.at(-1)!.view;
  const left = Math.max(0, p.turnEndsAt - Date.now());
  const timer = reveal ? "" : `<div class="timer"><div style="--ms:${left}ms;--from:${left / TURN_MS}"></div></div>`;
  const who = p.turn === HOST ? "Your" : `${esc(p.players.get(p.turn)?.name ?? "")}'s`;
  const winner = p.winner ? esc(p.players.get(p.winner)?.name ?? "") : "";
  const wrong = new Set(p.wrong);
  const mine = !reveal && p.turn === HOST;
  const options = reveal ? "" : p.mode === "choice"
    ? `<div class="choices shared">${r.options.map((o, i) => `<button data-opt="${esc(o.id)}" ${!mine || wrong.has(o.id) ? "disabled" : ""} class="${wrong.has(o.id) ? "out" : ""}">${mine ? `<kbd>${i + 1}</kbd>` : ""}${esc(o.title)}</button>`).join("")}</div>`
    : mine ? `<div class="typer"><ul id="sugg"></ul><input id="host-q" autocomplete="off" spellcheck="false" placeholder="Your turn — name that film…"></div>` : "";
  const turnLine = reveal
    ? `<div class="turn-line">${winner ? `<b>${winner}</b> got it!` : "Nobody got it"}</div>`
    : `<div class="turn-line"><span class="up">🎤 <b>${who}</b> turn</span><span class="for">for <b>${Math.max(1, 3 - p.misses) * (p.n === p.bonus ? 2 : 1)}</b> pts</span>${p.last ? `<span class="last">${esc(p.last)}</span>` : ""}</div>`;
  const typing = app().querySelector<HTMLInputElement>("#host-q");
  const kept = typing && !fresh ? typing.value : "";
  app().innerHTML = `${header(p, c)}<main class="play party">
    ${timer}
    <div class="marquee ${reveal ? (winner ? "won" : "lost") : p.n === p.bonus ? "bonus" : ""}"><div class="frame"><img src="${img}"></div></div>
    ${reveal
      ? `<div class="result won"><div class="title">${esc(r.item.title)}${r.item.year ? ` <span class="muted">(${r.item.year})</span>` : ""}</div></div>`
      : `<ul class="hints">${r.hints.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>`}
    ${turnLine}
    ${options}
    ${chips(players, reveal)}
    <div class="row">${reveal
      ? `<button id="next" class="primary big">${p.n >= ROUNDS ? "Final standings ⏎" : "Next round ⏎"}</button>`
      : `${mine ? `<button id="pass">Pass</button>` : `<button id="skip" class="ghost">Skip turn</button>`}<button id="next" class="ghost">End round now</button>`}</div>
  </main>`;
  wire(c);
  if (mine) wireTurn(p, c);
  const input = app().querySelector<HTMLInputElement>("#host-q");
  if (input && kept) {
    input.value = kept;
    input.dispatchEvent(new Event("input"));
  }
  if (reveal) app().querySelector<HTMLButtonElement>("#next")!.focus();
  if (!fresh) return;
  if (reveal) {
    if (winner) {
      sfx.correct(3);
      studioCue("good");
    }
    slam(app().querySelector(".result .title")!, 0.025);
    stagger(".chips li", 0.2);
  } else gsap.from(".turn-line .up", { scale: 0.6, opacity: 0, duration: 0.35, ease: "back.out(3)" });
}

/** The host's own answer controls: option buttons, or the fuzzy typer, plus Pass. */
function wireTurn(p: Party, c: Controls): void {
  const root = app();
  root.querySelectorAll<HTMLButtonElement>("[data-opt]").forEach((b) => b.addEventListener("click", () => c.guess(b.dataset.opt!)));
  root.querySelector("#pass")?.addEventListener("click", c.pass);
  const input = root.querySelector<HTMLInputElement>("#host-q");
  if (!input) return;
  const ul = root.querySelector("#sugg")!;
  const wrong = new Set(p.wrong);
  const pool = c.titles.filter((t) => !wrong.has(t.id));
  input.addEventListener("input", () => {
    ul.innerHTML = search(input.value, pool, (t) => t.title, 6).map((t) => `<li data-id="${esc(t.id)}">${esc(t.title)}</li>`).join("");
    ul.querySelectorAll<HTMLLIElement>("li").forEach((li) => li.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      c.guess(li.dataset.id!);
    }));
  });
  input.addEventListener("keydown", (e) => {
    const first = ul.querySelector<HTMLLIElement>("li");
    if (e.key === "Enter" && first) c.guess(first.dataset.id!);
  });
  input.focus();
}
