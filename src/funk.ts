/** Thinking music: an original, laid-back 70s soft-funk vamp, ~96 bpm, generated as Strudel code. */

// Dm9 | Dm9 | G13 | G13 | Dm9 | Dm9 | Bbmaj9 | A7#9 — bass roots as MIDI numbers.
const ROOTS = [38, 38, 31, 31, 38, 38, 34, 33];
const CHORDS = [
  "[f3,a3,c4,e4]", "[f3,a3,c4,e4]", "[f3,b3,e4,a4]", "[f3,b3,e4,a4]",
  "[f3,a3,c4,e4]", "[f3,a3,c4,e4]", "[a3,c4,d4,f4]", "[c#4,g4,c5]",
];
const REST = Array(16).fill("~");
/** A bar of 16ths with the given chord stabbed on steps 10 and 12 (the "and" of 3, then beat 4). */
const stabs = (ch: string) => `[${REST.map((r, i) => (i === 10 || i === 12 ? ch : r)).join(" ")}]`;
// Muted brass answers the groove at the end of bars 4 and 8.
const BRASS = ["~", "~", "~", stabs("[f4,b4,e5]"), "~", "~", "~", stabs("[c#5,g5,c6]")];

/** Syncopated funk bass: root, octave pop, fifth and flat seven, leaving space on the backbeats. */
const bass = (r: number) => `[${r} ~ ~ ${r + 12} ~ ~ ${r} ${r} ~ ~ ${r + 7} ~ ${r + 12} ~ ${r + 10} ${r + 12}]`;
const bars = (xs: string[]) => `"<${xs.join(" ")}>"`;

export const FUNK = {
  cps: 0.4,
  code: `
    const chords = note(${bars(CHORDS)});
    stack(
      chords.struct("x ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~ ~ ~")
        .s("sine").fm(1.1).fmh(1).fmdecay(0.25).fmsustain(0.1).decay(0.9).sustain(0.25).release(0.4).lpf(2200).gain(0.08).room(0.3),
      chords.struct("~ x ~ x ~ x x ~ ~ x ~ x ~ x ~ x")
        .s("square").lpf(500).lpenv(4).lpdecay(0.06).decay(0.08).sustain(0).gain(0.035),
      chords.struct("x*16").s("sawtooth").lpf("[500 1500 900 2100]*4").decay(0.05).sustain(0)
        .gain("[0.03 0.012 0.02 0.012]*4").room(0.15),
      chords.s("sawtooth").attack(0.8).release(1.5).lpf(1100).vib(4.5).vibmod(0.08).gain(0.028).room(0.5),
      note(${bars(ROOTS.map(bass))}).s("sawtooth").lpf(600).decay(0.14).sustain(0.3).release(0.05).gain(0.24),
      note(${bars(BRASS)}).s("sawtooth").lpf(800).lpenv(3).lpdecay(0.12).decay(0.14).sustain(0.25).release(0.08).gain(0.045).room(0.25),
      note("33").struct("x ~ ~ ~ ~ ~ ~ x ~ ~ x ~ ~ ~ ~ ~").s("sine").penv(24).pdecay(0.05).decay(0.22).sustain(0).lpf(300).gain(0.32),
      s("white").struct("~ ~ ~ ~ x ~ ~ x ~ x ~ ~ x ~ ~ x").decay(0.1).sustain(0).hpf(1500).lpf(7000)
        .gain("0 0 0 0 0.11 0 0 0.03 0 0.025 0 0 0.11 0 0 0.03"),
      s("white*16").decay(0.025).sustain(0).hpf(8500).gain("[0.03 0.012 0.02 0.012]*4"),
      s("white").struct("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ x ~").decay(0.18).sustain(0).hpf(7000).gain(0.025)
    )`,
};
