import { gsap, slam, stagger } from "../anim";
import { esc } from "../dom";
import { confetti, sfx } from "../fx";
import { search } from "../fuzzy";
import type { Conn, ConnState } from "./conn";
import type { Option, PlayerView, ToPlayer } from "./protocol";

type Msg<T extends ToPlayer["t"]> = Extract<ToPlayer, { t: T }>;

type S = {
  joined: boolean;
  conn: ConnState;
  me: string;
  mode: "choice" | "type";
  players: PlayerView[];
  titles: Option[];
  round?: Msg<"round">;
  turn?: Msg<"turn"> & { endsAt: number };
  /** A turn that arrived before its round's frames did. */
  early: Msg<"turn">[];
  reveal?: Msg<"reveal">;
  final?: Msg<"final">;
  frame: number;
  ended?: string;
};

const NAME_KEY = "ftg.name";
/** Give up on a host that dropped mid-game, or one never found at the start. */
const LOST_MS = 15_000;
const FIND_MS = 30_000;

/** The player's screen: join, wait, take turns guessing, see the reveal and final standings. */
export function runPlayer(conn: Conn, root: HTMLElement, leave?: () => void): void {
  const s: S = { joined: false, conn: "connecting", me: "", mode: "choice", players: [], titles: [], frame: 0, early: [] };
  let shown = "";
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const myTurn = () => !!s.turn && s.turn.turn === s.me && !s.reveal;

  let giveUp: ReturnType<typeof setTimeout> | undefined;
  const end = (why: string) => {
    clearTimeout(giveUp);
    if (s.ended) return;
    s.ended = why;
    conn.close();
    navigator.vibrate?.(300);
    render();
  };
  /** Starts the give-up countdown unless one is already running; only a successful connect clears it. */
  const watch = (ms: number, why: string) => {
    giveUp ??= setTimeout(() => end(why), ms);
  };
  watch(FIND_MS, "Couldn't find the party. Check the code and that the host is still running.");
  conn.onState((c) => {
    if (s.ended) return;
    s.conn = c;
    if (c === "open") {
      clearTimeout(giveUp);
      giveUp = undefined;
    }
    else if (c === "lost") watch(LOST_MS, "Lost connection to the host.");
    render();
  });
  conn.onMsg((m) => {
    if (s.ended) return;
    if (m.t === "ended") return end("The host ended the party.");
    if (m.t === "lobby") Object.assign(s, { me: m.you, mode: m.mode, players: m.players });
    else if (m.t === "titles") s.titles = m.items;
    else if (m.t === "round") {
      if (s.round && m.n < s.round.n) return;
      Object.assign(s, { round: m, turn: undefined, reveal: undefined, final: undefined, frame: m.frames.length - 1 });
      const early = s.early.filter((t) => t.n === m.n);
      s.early = [];
      early.forEach(onTurn);
    } else if (m.t === "turn") {
      if (s.round?.n === m.n) onTurn(m);
      else if (!s.round || m.n > s.round.n) s.early.push(m);
    } else if (m.t === "reveal") {
      Object.assign(s, { reveal: m, players: m.players });
      if (m.players.find((p) => p.id === s.me)?.gained) {
        sfx.correct(3);
        confetti(90);
      }
    } else if (m.t === "final") Object.assign(s, { final: m, players: m.players });
    render();
  });

  function onTurn(m: Msg<"turn">): void {
    const r = s.round!;
    if (m.frame && m.fi !== undefined && !r.frames[m.fi]) {
      r.frames[m.fi] = m.frame;
      s.frame = m.fi;
    }
    const prev = s.turn;
    if (s.reveal || (prev && m.seq <= prev.seq)) return;
    s.turn = { ...m, endsAt: Date.now() + m.msLeft };
    if (prev && m.wrong.length > prev.wrong.length) sfx.wrong();
    if (m.turn === s.me && prev?.turn !== s.me) {
      sfx.slam();
      navigator.vibrate?.([80, 60, 80]);
    }
  }

  const guess = (id: string) => myTurn() && conn.send({ t: "guess", n: s.round!.n, id });
  const myRank = () => s.players.findIndex((p) => p.id === s.me) + 1;
  const myScore = () => s.players.find((p) => p.id === s.me)?.score ?? 0;

  function render(): void {
    const key = s.ended ? "ended" : !s.joined ? "join" : s.final ? "final" : s.reveal ? `rev${s.reveal.n}` : s.round ? `r${s.round.n}:${s.turn?.turn}:${s.turn?.wrong.length}` : "lobby";
    const fresh = key !== shown;
    shown = key;
    const typing = q<HTMLInputElement>("#pl-q");
    const keep = typing && !fresh ? { value: typing.value, focused: document.activeElement === typing } : null;
    const top = `<div class="pl-top"><span>${s.joined ? esc(localStorage.getItem(NAME_KEY) ?? "") : `<span class="pl-logo">F&amp;F</span>`}</span>
      <span class="pl-conn ${s.ended ? "lost" : s.conn}">${s.ended ? "" : s.conn === "open" ? `${myScore()} pts` : s.conn === "lost" ? "Reconnecting…" : "Connecting…"}</span>
      ${leave && !s.ended ? `<button class="ghost pl-leave">Leave</button>` : ""}</div>`;
    root.innerHTML = `<div class="pl">${top}${body()}</div>`;
    q(".pl-back")?.addEventListener("click", () => (leave ? leave() : location.reload()));
    q(".pl-leave")?.addEventListener("click", () => {
      clearTimeout(giveUp);
      conn.close();
      leave?.();
    });
    wire();
    const input = q<HTMLInputElement>("#pl-q");
    if (input && keep) {
      input.value = keep.value;
      if (keep.focused) input.focus();
      input.dispatchEvent(new Event("input"));
    } else if (input && fresh) input.focus();
    if (!fresh) return;
    if (s.final) {
      stagger(".pl-standings li", 0.3);
      if (myRank() === 1) confetti(200);
    } else if (s.reveal) {
      slam(q(".pl-title")!, 0.03);
      gsap.from(".pl-gain", { scale: 0.3, opacity: 0, duration: 0.45, delay: 0.3, ease: "back.out(3)" });
    } else if (s.turn) gsap.from(".pl-turn", { scale: 0.7, opacity: 0, duration: 0.3, ease: "back.out(3)" });
  }

  function body(): string {
    if (s.ended) {
      return `<div class="pl-center pl-ended"><h2>Show's over</h2><p>${esc(s.ended)}</p>
        ${s.players.length && s.round ? `<p class="muted">You finished with ${myScore()} pts.</p>` : ""}
        <button class="primary big pl-back">${leave ? "Back to menu" : "Try again"}</button></div>`;
    }
    if (!s.joined) {
      return `<form class="pl-join"><h1>Join the show</h1>
        <input id="pl-name" maxlength="20" placeholder="Your name" value="${esc(localStorage.getItem(NAME_KEY) ?? "")}" autocomplete="nickname">
        <button class="primary big">I'm in</button></form>`;
    }
    if (s.final) {
      return `<div class="pl-center"><div class="sub">You finished</div><h1 class="pl-place">#${myRank() || "–"}</h1><div class="sub">Hall of Frame</div>
        <ol class="pl-standings">${s.players.map((p) => `<li class="${p.id === s.me ? "me" : ""}"><span>${esc(p.name)}</span><b>${p.score}</b></li>`).join("")}</ol></div>`;
    }
    if (s.reveal) {
      const me = s.reveal.players.find((p) => p.id === s.me);
      const who = s.reveal.winner ? `${esc(s.reveal.winner)} got it` : "Nobody got it";
      return `<div class="pl-center"><img class="pl-frame" src="${s.reveal.src}">
        <div class="pl-title">${esc(s.reveal.title)}</div>${s.reveal.year ? `<div class="muted">${s.reveal.year}</div>` : ""}
        <div class="pl-gain ${me?.gained ? "good" : ""}">${me?.gained ? `+${me.gained}` : who}</div>
        <p class="muted">You're #${myRank()} with ${myScore()} pts</p></div>`;
    }
    if (!s.round || !s.turn) {
      return `<div class="pl-center"><h2>${s.conn === "open" ? "You're in!" : "Finding the host…"}</h2>
        <p class="muted">${s.round ? "Get ready…" : "Waiting for the host to start."}</p>
        <ul class="pl-lobby">${s.players.map((p) => `<li>${esc(p.name)}</li>`).join("")}</ul></div>`;
    }
    const r = s.round;
    const t = s.turn;
    const mine = myTurn();
    const left = Math.max(0, t.endsAt - Date.now());
    const strip = r.frames.length > 1 ? `<div class="pl-strip">${r.frames.map((f, i) => `<img data-f="${i}" class="${i === s.frame ? "on" : ""}" src="${f}">`).join("")}</div>` : "";
    const head = `<div class="pl-round">Round ${r.n}/${r.of}${r.bonus ? ` · <span class="tag">×2</span>` : ""}</div>
      <img class="pl-frame" src="${r.frames[s.frame] ?? r.frames[0]}">${strip}
      <ul class="hints">${t.hints.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
      <div class="pl-turn ${mine ? "mine" : ""}">${mine ? `Your turn! · <b>${t.worth}</b> pts` : `🎤 ${esc(t.turnName)} is guessing…`}</div>
      <div class="pl-timer"><div style="--ms:${left}ms;--from:${left / t.msTotal}"></div></div>
      ${t.last ? `<p class="muted pl-last">${esc(t.last)}</p>` : ""}`;
    const wrong = new Set(t.wrong);
    if (s.mode === "choice") {
      return `${head}<div class="pl-choices">${r.options.map((o) =>
        `<button data-opt="${esc(o.id)}" class="${wrong.has(o.id) ? "out" : ""}" ${!mine || wrong.has(o.id) ? "disabled" : ""}>${esc(o.title)}</button>`).join("")}</div>
        ${mine ? `<button class="ghost pl-giveup">Pass</button>` : ""}`;
    }
    if (!mine) return head;
    return `${head}<div class="typer"><input id="pl-q" autocomplete="off" spellcheck="false" placeholder="Name that film…"><ul id="pl-sugg"></ul></div>
      <button class="ghost pl-giveup">Pass</button>`;
  }

  function wire(): void {
    q<HTMLFormElement>(".pl-join")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = q<HTMLInputElement>("#pl-name")!.value.trim().slice(0, 20) || "Player";
      localStorage.setItem(NAME_KEY, name);
      s.joined = true;
      conn.send({ t: "hello", name });
      render();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-opt]").forEach((b) => b.addEventListener("click", () => guess(b.dataset.opt!)));
    root.querySelectorAll<HTMLImageElement>("[data-f]").forEach((img) =>
      img.addEventListener("click", () => {
        s.frame = Number(img.dataset.f);
        render();
      }),
    );
    q(".pl-giveup")?.addEventListener("click", () => myTurn() && conn.send({ t: "giveup", n: s.round!.n }));
    const input = q<HTMLInputElement>("#pl-q");
    if (!input) return;
    const ul = q("#pl-sugg")!;
    const wrong = new Set(s.turn?.wrong ?? []);
    const pool = s.titles.filter((t) => !wrong.has(t.id));
    input.addEventListener("input", () => {
      ul.innerHTML = search(input.value, pool, (t) => t.title, 6)
        .map((t) => `<li data-id="${esc(t.id)}">${esc(t.title)}</li>`).join("");
      ul.querySelectorAll<HTMLLIElement>("li").forEach((li) =>
        li.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          guess(li.dataset.id!);
        }),
      );
    });
    input.addEventListener("keydown", (e) => {
      const first = ul.querySelector<HTMLLIElement>("li");
      if (e.key === "Enter" && first) guess(first.dataset.id!);
    });
  }

  render();
}
