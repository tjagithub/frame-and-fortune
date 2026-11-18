/** The score-screen tune: original 80s Japanese-style jazz fusion, ~150 bpm, generated as Strudel code. */

// Dbmaj9 | Cm9 F13 | Bbm9 | Eb9sus | Gbmaj9 | Fm9 Bb9 | Ebm9 | Ab13sus — bass roots as MIDI numbers.
const ROOTS: number[][] = [[37], [36, 41], [34], [39], [42], [41, 34], [39], [32]];
const CHORDS = [
  "[f3,ab3,c4,eb4]", "[[eb3,g3,bb3,d4] [eb3,a3,c4,d4]]", "[db3,f3,ab3,c4]", "[db3,f3,ab3,bb3]",
  "[f3,ab3,bb3,db4]", "[[eb3,g3,ab3,c4] [d3,f3,ab3,c4]]", "[gb3,bb3,db4,f4]", "[gb3,bb3,db4,f4]",
];
const LEAD = [
  "[f5 ~ eb5 f5 ~ ab5 ~ c6 ~ ~ ab5 ~ f5 ~ eb5 ~]",
  "[g5 ~ ~ bb5 ~ g5 ~ eb5 ~ ~ c5 ~ eb5 ~ f5 ~]",
  "[f5 ~ ~ ~ ~ ~ ~ ~ db5 ~ eb5 ~ f5 ~ ab5 ~]",
  "[bb5 ~ ~ ab5 ~ ~ f5 ~ ~ ~ ~ ~ ~ ~ ~ ~]",
  "[bb5 ~ ab5 bb5 ~ db6 ~ f6 ~ ~ db6 ~ bb5 ~ ab5 ~]",
  "[c6 ~ ~ eb6 ~ c6 ~ ab5 ~ ~ f5 ~ ab5 ~ d6 ~]",
  "[bb5 ~ ~ ~ ~ ~ ~ ~ gb5 ~ ab5 ~ bb5 ~ db6 ~]",
  "[eb6 ~ ~ db6 ~ ~ bb5 ~ ab5 ~ f5 ~ eb5 ~ db5 ~]",
];

/** Slap-style bass: root, octave pops and ghosted repeats across 16ths; split bars change root halfway. */
function slap(roots: number[]): string {
  const a = roots[0]!;
  const b = roots[1] ?? a;
  return `[${a} ~ ${a + 12} ${a} ~ ${a} ${a + 12} ~ ${b} ~ ~ ${b + 12} ~ ${b} ${b + 10} ${b + 12}]`;
}

const bars = (xs: string[]) => `"<${xs.join(" ")}>"`;
// Tom fills at the end of bars 4 and 8: four 16ths, then a full beat of descending sextuplets.
const TOMS = `"<~ ~ ~ [~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ 67 60 55 48] ~ ~ ~ [~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ [72 67 60 55 48 43]@4]>"`;

export const FUSION = {
  cps: 0.625,
  code: `
    const chords = note(${bars(CHORDS)});
    stack(
      chords.struct("x ~ ~ x ~ ~ x ~ ~ ~ x ~ x ~ ~ ~")
        .s("sawtooth").attack(0.005).decay(0.12).sustain(0.15).release(0.08).lpf(2600).gain(0.085).room(0.2),
      chords.s("triangle").attack(0.05).decay(0.7).sustain(0.25).release(0.4).lpf(1800).gain(0.05).room(0.3),
      note(${bars(ROOTS.map(slap))}).s("sawtooth").lpf(850).decay(0.16).sustain(0.25).release(0.05).gain(0.26),
      note(${bars(LEAD)}).s("square").lpf(3200).attack(0.01).decay(0.25).sustain(0.45).release(0.12)
        .delay(0.22).delaytime(0.24).delayfeedback(0.25).room(0.25).gain(0.05),
      note("31").struct("x ~ ~ x ~ ~ x ~ ~ ~ x ~ ~ x ~ ~").s("sine").penv(30).pdecay(0.06).decay(0.25).sustain(0).lpf(400).gain(0.5),
      s("white").struct("~ ~ ~ ~ x ~ ~ x ~ x ~ ~ x ~ x ~").decay(0.13).sustain(0).hpf(1300).lpf(9000)
        .gain("0 0 0 0 0.32 0 0 0.07 0 0.06 0 0 0.32 0 0.08 0"),
      note("55").struct("~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~").s("triangle").penv(7).pdecay(0.03).decay(0.09).sustain(0).gain(0.3),
      s("white*16").decay(0.03).sustain(0).hpf(8000).gain("[0.045 0.02 0.032 0.02]*4"),
      note(${TOMS}).s("sine").penv(10).pdecay(0.05).decay(0.3).sustain(0).gain(0.42),
      s("<x ~ ~ ~>").s("white").decay(1.5).sustain(0).hpf(5500).gain(0.12)
    )`,
};
