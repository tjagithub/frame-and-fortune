import { playFill } from "./sting";
import { FUNK } from "./funk";
import { FUSION } from "./fusion";
import { isMuted, sfx } from "./fx";

/** Ambient game-show music, synthesised live with Strudel (synth voices only, no sample downloads). */
export type Mood = "lounge" | "think" | "fusion" | "off";

const MUSIC_KEY = "ftg.music";
export const musicOn = (): boolean => localStorage.getItem(MUSIC_KEY) !== "0";

// Original tunes in Strudel mini-notation, one cycle per bar. Bossa band layout: Rhodes on 1 and &3,
// guitar on syncopated 8ths, bass+kick on 1 &2 3 &4, 2-bar cross-stick clave, shakers on 8ths.
const TUNES: Record<Exclude<Mood, "off">, { cps: number; code: string }> = {
  // Fmaj9 | Fmaj9 | Gm9 | C13 | Am9 | D7b9 | Gm9 | C9sus, ~125 bpm.
  lounge: {
    cps: 0.52,
    code: `
      const chords = note("<[a3,c4,e4,g4] [a3,c4,e4,g4] [bb3,d4,f4,a4] [bb3,d4,e4,a4] [g3,b3,c4,e4] [f#3,c4,eb4,a4] [bb3,d4,f4,a4] [bb3,d4,f4,g4]>");
      stack(
        chords.struct("x ~ ~ ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~")
          .s("sine").fm(1.2).fmh(1).fmdecay(0.25).fmsustain(0.1).decay(0.8).sustain(0.25).release(0.4).lpf(2400).gain(0.12).room(0.3),
        chords.struct("<[~ x x ~ x x x ~] [x ~ x ~ ~ x ~ x]>")
          .s("triangle").decay(0.16).sustain(0).lpf(2200).gain(0.08).room(0.2),
        chords.s("sawtooth").attack(0.8).release(1.2).lpf(700).gain(0.035).room(0.5),
        note("<[f2 ~ ~ c2 f2 ~ ~ c2]!2 [g2 ~ ~ d2 g2 ~ ~ d2] [c2 ~ ~ g1 c2 ~ ~ g1] [a1 ~ ~ e2 a1 ~ ~ e2] [d2 ~ ~ a1 d2 ~ ~ a1] [g1 ~ ~ d2 g1 ~ ~ d2] [c2 ~ ~ g1 c2 ~ ~ g1]>")
          .s("sine").decay(0.3).sustain(0.2).release(0.15).lpf(450).gain(0.4),
        note("e1").struct("x ~ ~ x x ~ ~ x").s("sine").decay(0.12).sustain(0).lpf(160).gain(0.22),
        note("<[~ e5 ~ ~ c5 ~ ~ ~] [~ ~ ~ ~ ~ ~ a4 ~] [~ f5 ~ ~ d5 ~ ~ ~] [~ ~ e5 ~ ~ ~ ~ ~] [~ g5 ~ ~ e5 ~ ~ ~] [~ ~ ~ ~ f#5 ~ ~ ~] [~ a5 ~ ~ f5 ~ ~ ~] [~ ~ g5 ~ ~ ~ ~ ~]>")
          .s("sine").fm(0.6).fmh(4).fmdecay(0.15).decay(0.4).sustain(0).delay(0.3).delaytime(0.375).delayfeedback(0.3).room(0.55).gain(0.08),
        s("<[~ ~ ~ ~ x ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~] [x ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~ x ~ ~ ~]>")
          .s("white").decay(0.018).sustain(0).bpf(1900).gain(0.05),
        s("pink*8").decay(0.03).sustain(0).hpf(6000).gain("[0.03 0.018]*4"),
        s("white*8").decay(0.05).sustain(0).hpf(9000).gain(0.008)
      )`,
  },
  think: FUNK,
  fusion: FUSION,
};

type Strudel = typeof import("@strudel/web");
let lib: Promise<{ s: Strudel; repl: Awaited<ReturnType<Strudel["initStrudel"]>> }> | null = null;
let ready: Strudel | null = null;
let mood: Mood = "off";
/** What is actually playing: "off", a mood, or a mood ducked under a sting (e.g. "think:duck"). */
let playing = "off";
let ducked = false;
let unduck: ReturnType<typeof setTimeout> | undefined;
/** Music level while a round sting plays over it. */
const DUCK = 0.25;

/** Loads Strudel on the first user gesture: browsers refuse to start audio before one anyway. */
function load() {
  lib ??= import("@strudel/web").then(async (s) => {
    const repl = await s.initStrudel();
    ready = s;
    return { s, repl };
  });
  return lib;
}

async function apply(): Promise<void> {
  const want: Mood = musicOn() && !isMuted() ? mood : "off";
  const key = want === "off" ? want : `${want}${ducked ? ":duck" : ""}`;
  if (key === playing || !lib) return;
  playing = key;
  const { s, repl } = await lib;
  if (want === "off") return s.hush();
  const tune = TUNES[want];
  repl.setCps(tune.cps);
  // Re-evaluating while the clock runs swaps the pattern in place, so the groove keeps its position.
  await s.evaluate(ducked ? `${tune.code}.postgain(${DUCK})` : tune.code);
}

/**
 * Round transition: a brass sting. Thinking music already playing dips under it and carries on;
 * anything else (the menu tune) stops so the round's groove can start after the sting.
 */
export function roundSting(big: boolean): void {
  if (!playing.startsWith("think")) setMood("off");
  if (isMuted()) return;
  if (!ready) return void (big ? sfx.bonus() : sfx.slam());
  const secs = playFill(ready.superdough, ready.getAudioContext().currentTime, big);
  ducked = true;
  void apply();
  clearTimeout(unduck);
  unduck = setTimeout(() => {
    ducked = false;
    void apply();
  }, secs * 1000);
}

/** Sets the background mood for the current screen. */
export function setMood(m: Mood): void {
  mood = m;
  void apply().catch((e) => console.warn("music:", e));
}

export function toggleMusic(): boolean {
  localStorage.setItem(MUSIC_KEY, musicOn() ? "0" : "1");
  void apply();
  return musicOn();
}

export const musicButton = (): string =>
  `<button id="music" class="ghost icon ${musicOn() ? "" : "off"}" title="Music">♪</button>`;

export function wireMusicButton(): void {
  document.querySelector("#music")?.addEventListener("click", (e) => {
    (e.currentTarget as HTMLElement).classList.toggle("off", !toggleMusic());
  });
}

/** Call once at startup. */
export function initMusic(): void {
  const start = () => {
    void load().then(apply).catch((e) => console.warn("music disabled:", e));
    removeEventListener("pointerdown", start);
    removeEventListener("keydown", start);
  };
  addEventListener("pointerdown", start);
  addEventListener("keydown", start);
  addEventListener("ftg:mute", () => void apply());
}
