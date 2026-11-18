import { newRound, nextHint, type Mode, type Round } from "../game";
import type { Item } from "../library";
import type { Difficulty } from "../obscure";
import { norm } from "../titles";
import { combine, lanHub, netHub, type Hub, type HubEvents } from "./hub";
import { setMood } from "../music";
import * as ui from "./host-ui";
import { newCode, type Option, type PlayerView, type ToHost, type ToPlayer } from "./protocol";

export const ROUNDS = 10;
export const TURN_MS = 20_000;
/** The host plays too, from the big screen, under this id. */
export const HOST = "host";
const REVEAL_MS = 9_000;
/** A round ends unanswered after this many misses, so everyone gets about two turns. */
const maxMisses = (players: number) => Math.max(4, players * 2);

export type P = PlayerView;

export type Party = {
  code: string;
  lanUrl: string | null;
  lanError: string | null;
  mode: Mode;
  players: Map<string, P>;
  /** Join order; turns go round this list, and each round starts one seat further on. */
  seats: string[];
  phase: "lobby" | "intro" | "round" | "reveal" | "final";
  n: number;
  bonus: number;
  r: Round | null;
  turn: string;
  turnEndsAt: number;
  misses: number;
  wrong: string[];
  last: string;
  winner: string | null;
};

/** Hosts a party: this window becomes the big screen; players join by LAN QR code or online code. */
export async function hostParty(lib: Item[], mode: Mode, difficulty: Difficulty, menu: () => void): Promise<void> {
  const titles: Option[] = [...new Map(lib.map((x) => [norm(x.title), { id: x.id, title: x.title }])).values()];
  const byId = new Map(lib.map((x) => [x.id, x]));
  const party: Party = {
    code: newCode(), lanUrl: null, lanError: null, mode, players: new Map(), seats: [],
    phase: "lobby", n: 0, bonus: 0, r: null, turn: "", turnEndsAt: 0, misses: 0, wrong: [], last: "", winner: null,
  };
  party.players.set(HOST, { id: HOST, name: localStorage.getItem("ftg.name") || "Host", score: 0, online: true, status: "waiting", gained: 0 });
  party.seats.push(HOST);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let seq = 0;

  const ev: HubEvents = {
    join: (id) => send(id, lobbyFor(id)),
    leave: (id) => {
      const p = party.players.get(id);
      if (!p) return;
      p.online = false;
      if (party.phase === "round" && party.turn === id && !busy) advance(`${p.name} left`);
      else refresh();
    },
    msg: (from, m) => onMsg(from, m),
  };
  const noop: Hub = { send: () => {}, stop: () => {} };
  let lan = noop;
  try {
    const l = await lanHub(party.code, ev);
    lan = l.hub;
    party.lanUrl = l.url;
  } catch (e) {
    party.lanError = String(e);
  }
  const hub = combine([lan, netHub(party.code, ev)]);

  const views = (): PlayerView[] =>
    [...party.players.values()].map((p) => ({ ...p })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const lobbyFor = (id: string): ToPlayer => ({ t: "lobby", players: views(), you: id, mode });
  const send = (to: string | null, m: ToPlayer) => to !== HOST && hub.send(to, m);
  const refresh = () => {
    party.players.forEach((p) => p.online && send(p.id, lobbyFor(p.id)));
    ui.render(party, controls);
  };
  const isBonus = () => party.n === party.bonus;
  const worth = () => Math.max(1, 3 - party.misses) * (isBonus() ? 2 : 1);
  const online = (id: string) => party.players.get(id)?.online ?? false;

  /** The first online seat at or after `from` (wrapping), or "" if nobody is online. */
  function seatFrom(from: number): string {
    const n = party.seats.length;
    for (let i = 0; i < n; i++) {
      const id = party.seats[(((from + i) % n) + n) % n]!;
      if (online(id)) return id;
    }
    return "";
  }

  const roundMsg = (): ToPlayer => ({
    t: "round", n: party.n, of: ROUNDS, bonus: isBonus(), frames: party.r!.frames.map((f) => f.view),
    options: mode === "choice" ? party.r!.options.map((o) => ({ id: o.id, title: o.title })) : [],
  });
  const turnMsg = (frame?: string): ToPlayer => ({
    seq: ++seq, fi: frame ? party.r!.frames.length - 1 : undefined,
    t: "turn", n: party.n, turn: party.turn, turnName: party.players.get(party.turn)?.name ?? "",
    msLeft: Math.max(0, party.turnEndsAt - Date.now()), msTotal: TURN_MS,
    hints: party.r!.hints, wrong: party.wrong, worth: worth(), frame, last: party.last || undefined,
  });

  function setTurn(id: string): void {
    party.players.forEach((p) => (p.status = p.id === id ? "turn" : "waiting"));
    party.turn = id;
    party.turnEndsAt = Date.now() + TURN_MS;
    clearTimeout(timer);
    const n = party.n;
    timer = setTimeout(() => {
      if (party.phase === "round" && party.n === n && party.turn === id) void miss(`${party.players.get(id)?.name ?? "?"} ran out of time`);
    }, TURN_MS);
  }

  /** Passes the turn on without a penalty (the current player left). */
  function advance(last: string): void {
    const next = seatFrom(party.seats.indexOf(party.turn) + 1);
    if (!next) return void endRound();
    party.last = last;
    setTurn(next);
    send(null, turnMsg());
    ui.render(party, controls);
  }

  /** A wrong answer, pass or timeout: everyone gets a hint and the next player is up. */
  async function miss(last: string): Promise<void> {
    if (busy || !party.r) return;
    const r = party.r;
    party.misses++;
    if (party.misses >= maxMisses(party.seats.filter(online).length)) return void endRound();
    busy = true;
    clearTimeout(timer);
    const before = r.frames.length;
    await nextHint(r);
    busy = false;
    if (party.r !== r || party.phase !== "round") return;
    const next = seatFrom(party.seats.indexOf(party.turn) + 1);
    if (!next) return void endRound();
    party.last = last;
    setTurn(next);
    send(null, turnMsg(r.frames.length > before ? r.frames.at(-1)!.view : undefined));
    if (next === HOST) ui.cue("turn");
    ui.render(party, controls);
    ui.cue("miss");
  }

  function onMsg(from: string, m: ToHost): void {
    if (m.t === "hello") {
      const name = m.name.trim().slice(0, 20) || "Player";
      const p = party.players.get(from);
      if (p) Object.assign(p, { name, online: true });
      else party.players.set(from, { id: from, name, score: 0, online: true, status: "waiting", gained: 0 });
      if (!party.seats.includes(from)) party.seats.push(from);
      if (mode === "type") send(from, { t: "titles", items: titles });
      refresh();
      if (party.phase === "round") {
        send(from, roundMsg());
        send(from, turnMsg());
      }
      return;
    }
    const p = party.players.get(from);
    if (!p || busy || party.phase !== "round" || m.n !== party.n || party.turn !== from) return;
    if (m.t === "giveup") return void miss(`${p.name} passed`);
    const it = byId.get(m.id);
    const answer = party.r!.item;
    if (it && (it.id === answer.id || norm(it.title) === norm(answer.title))) {
      p.gained = worth();
      p.score += p.gained;
      p.status = "right";
      party.winner = from;
      return void endRound();
    }
    if (!party.wrong.includes(m.id)) party.wrong.push(m.id);
    void miss(`${p.name} guessed ${it?.title ?? "?"}`);
  }

  async function startRound(): Promise<void> {
    clearTimeout(timer);
    party.n++;
    party.phase = "intro";
    Object.assign(party, { misses: 0, wrong: [], last: "", winner: null });
    party.players.forEach((p) => Object.assign(p, { status: "waiting", gained: 0 }));
    ui.intro(party, controls);
    const [r] = await Promise.all([newRound(lib, difficulty), new Promise((res) => setTimeout(res, isBonus() ? 1900 : 1100))]);
    if (party.phase !== "intro") return;
    party.r = r;
    party.phase = "round";
    setMood("think");
    const first = seatFrom(party.n - 1);
    if (!first) return void endRound();
    setTurn(first);
    send(null, roundMsg());
    send(null, turnMsg());
    ui.render(party, controls);
    if (first === HOST) ui.cue("turn");
  }

  function endRound(): void {
    if (party.phase !== "round" || !party.r) return;
    clearTimeout(timer);
    party.phase = "reveal";
    party.turn = "";
    const { item, frames } = party.r;
    const winner = party.winner ? party.players.get(party.winner)?.name : undefined;
    send(null, { t: "reveal", n: party.n, title: item.title, year: item.year, src: frames[0]!.src, winner, players: views() });
    ui.render(party, controls);
    const n = party.n;
    timer = setTimeout(() => party.phase === "reveal" && party.n === n && controls.next(), REVEAL_MS);
  }

  function final(): void {
    clearTimeout(timer);
    party.phase = "final";
    setMood("off");
    send(null, { t: "final", players: views() });
    ui.render(party, controls);
  }

  const controls: ui.Controls = {
    start: () => {
      if (!party.players.size) return;
      party.n = 0;
      party.bonus = 4 + Math.floor(Math.random() * 6);
      party.players.forEach((p) => (p.score = 0));
      void startRound();
    },
    next: () => {
      if (party.phase === "reveal") party.n >= ROUNDS ? final() : void startRound();
      else if (party.phase === "round") endRound();
    },
    skip: () => party.phase === "round" && void miss(`${party.players.get(party.turn)?.name ?? "?"} was skipped`),
    lobby: () => {
      clearTimeout(timer);
      party.phase = "lobby";
      setMood("lounge");
      refresh();
    },
    quit: () => {
      clearTimeout(timer);
      removeEventListener("keydown", onKey);
      send(null, { t: "ended" });
      // Give the goodbye time to leave before the sockets close.
      setTimeout(() => hub.stop(), 600);
      menu();
    },
    guess: (id) => onMsg(HOST, { t: "guess", n: party.n, id }),
    pass: () => onMsg(HOST, { t: "giveup", n: party.n }),
    titles,
    views,
  };
  /** Number keys 1–6 answer on the host's turn in multiple choice. */
  const onKey = (e: KeyboardEvent) => {
    if (party.phase !== "round" || party.turn !== HOST || mode !== "choice" || e.target instanceof HTMLInputElement) return;
    const o = party.r?.options[Number(e.key) - 1];
    if (o && !party.wrong.includes(o.id)) controls.guess(o.id);
  };
  addEventListener("keydown", onKey);
  refresh();
}
