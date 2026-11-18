/** Round-transition sting: a 70s game-show brass hit — trumpet pickup into a held chord. */
type Voice = Record<string, number | string>;
type Trigger = (value: Voice, t: number, dur: number) => unknown;
/** A note: MIDI pitch (or names via midi()), start in seconds from the sting's start, length in seconds. */
type Note = [pitch: number, at: number, len: number];

const NAMES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** "bb4" → 70. */
const midi = (n: string): number => {
  const m = /^([a-g])(b|#)?(-?\d)$/.exec(n)!;
  return NAMES[m[1]!]! + (m[2] === "b" ? -1 : m[2] === "#" ? 1 : 0) + 12 * (Number(m[3]) + 1);
};

/** A brass player: two slightly detuned saws through a filter that opens with a "bwah", vibrato on long notes. */
function brass(pitch: number, len: number, gain: number, bright = 1): Voice[] {
  const v = {
    s: "sawtooth", attack: 0.025, decay: 0.12, sustain: 0.75, release: 0.12,
    lpf: 650 * bright, lpenv: 3.2, lpattack: 0.05, lpdecay: 0.18, lpsustain: 0.45,
    vib: len > 0.3 ? 5.5 : 0, vibmod: len > 0.3 ? 0.12 : 0, room: 0.25,
  };
  return [{ ...v, note: pitch, gain }, { ...v, note: pitch + 0.09, gain: gain * 0.7 }];
}

const kick = (g: number): Voice => ({ s: "sine", note: 33, penv: 24, pdecay: 0.05, decay: 0.25, sustain: 0, lpf: 300, gain: g });
const cymbal = (g: number): Voice => ({ s: "white", attack: 0.005, decay: 1.2, sustain: 0, hpf: 6000, gain: g });
const snare = (g: number): Voice => ({ s: "white", decay: 0.09, sustain: 0, hpf: 1500, lpf: 7000, gain: g });

const chord = (names: string, at: number, len: number): Note[] => names.split(" ").map((n) => [midi(n), at, len]);
const line = (names: string, at: number, step: number): Note[] => names.split(" ").map((n, i) => [midi(n), at + i * step, step * 0.9]);

/** Normal round: a three-note trumpet pickup into a held F6/9. */
function roundHit(): { trumpets: Note[]; bones: Note[]; land: number } {
  const s = 0.11;
  const land = 3 * s;
  return {
    trumpets: [...line("c5 d5 f5", 0, s), ...chord("d5 g5", land, 0.55), [midi("a5"), land, 0.6]],
    bones: chord("f3 c4 a3", land, 0.55),
    land,
  };
}

/** Double Feature: a short Bb stab, then a five-note run up into a bigger F6/9 with the trumpets on top. */
function bonusHit(): { trumpets: Note[]; bones: Note[]; land: number } {
  const s = 0.09;
  const run = 0.62;
  const land = run + 5 * s;
  return {
    trumpets: [...chord("d5 g5 c6", 0, 0.16), ...line("c5 d5 f5 g5 a5", run, s), ...chord("d5 g5 c6", land, 0.7)],
    bones: [...chord("bb2 f3 d4", 0, 0.16), ...chord("f2 c4 a3", land, 0.7)],
    land,
  };
}

/** Plays the sting; returns how long it lasts in seconds. */
export function playFill(trigger: Trigger, now: number, big: boolean): number {
  const t0 = now + 0.05;
  const { trumpets, bones, land } = big ? bonusHit() : roundHit();
  const play = (notes: Note[], gain: number, bright: number) => {
    for (const [p, at, len] of notes) for (const v of brass(p, len, gain, bright)) trigger(v, t0 + at, len);
  };
  play(trumpets, 0.07, 1.6);
  play(bones, 0.065, 0.9);
  // Light drums: two soft snare pickups, then kick and cymbal on the landing.
  trigger(snare(0.08), t0 + land - 0.22, 0.1);
  trigger(snare(0.12), t0 + land - 0.11, 0.1);
  if (big) trigger(kick(0.5), t0, 0.1);
  trigger(kick(0.6), t0 + land, 0.1);
  trigger(cymbal(big ? 0.12 : 0.09), t0 + land, 0.1);
  return land + (big ? 0.7 : 0.6);
}
