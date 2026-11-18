const MUTE_KEY = "ftg.muted";
let ctx: AudioContext | null = null;

export const isMuted = (): boolean => localStorage.getItem(MUTE_KEY) === "1";
export const toggleMute = (): void => {
  localStorage.setItem(MUTE_KEY, isMuted() ? "0" : "1");
  dispatchEvent(new Event("ftg:mute"));
};

function audio(): AudioContext | null {
  if (isMuted()) return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, at: number, dur: number, type: OscillatorType = "triangle", vol = 0.18): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(at: number, dur: number, vol: number): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  const filter = a.createBiquadFilter();
  const gain = a.createGain();
  filter.type = "bandpass";
  filter.frequency.value = 900;
  gain.gain.value = vol;
  src.buffer = buf;
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(t);
}

export const sfx = {
  correct(pts: number): void {
    const notes = pts >= 3 ? [523, 659, 784, 1047, 1319] : pts === 2 ? [523, 659, 784, 1047] : [523, 784];
    notes.forEach((f, i) => tone(f, i * 0.085, 0.35, "square", 0.08));
    notes.forEach((f, i) => tone(f * 2, i * 0.085, 0.3, "sine", 0.06));
  },
  wrong(): void {
    tone(140, 0, 0.45, "sawtooth", 0.12);
    tone(147, 0, 0.45, "sawtooth", 0.12);
  },
  slam(): void {
    noise(0, 0.25, 0.6);
    tone(90, 0, 0.3, "sine", 0.35);
  },
  bonus(): void {
    [392, 494, 587, 784, 587, 784].forEach((f, i) => tone(f, i * 0.11, 0.25, "square", 0.07));
  },
  splat(): void {
    noise(0, 0.16, 1.1);
    tone(120, 0, 0.18, "sine", 0.45);
    tone(60, 0.02, 0.3, "sine", 0.3);
  },
  tick(): void {
    tone(1800, 0, 0.04, "square", 0.03);
  },
  drumroll(seconds: number): void {
    for (let t = 0; t < seconds; t += 0.045) noise(t, 0.05, 0.25 + (t / seconds) * 0.35);
    noise(seconds, 0.5, 0.9);
    tone(65, seconds, 0.6, "sine", 0.4);
  },
  fanfare(): void {
    const seq: [number, number, number][] = [[523, 0, 0.18], [523, 0.2, 0.12], [523, 0.34, 0.12], [698, 0.5, 0.7], [880, 0.5, 0.7], [1047, 0.5, 0.9]];
    seq.forEach(([f, at, d]) => tone(f, at, d, "square", 0.07));
  },
};

type Bit = { x: number; y: number; vx: number; vy: number; r: number; spin: number; color: string; w: number; h: number };
const COLORS = ["#f5b301", "#ff4d6d", "#3ecf8e", "#4cc9f0", "#ffffff", "#c77dff"];

/** Bursts confetti from the given point (defaults to upper centre). */
export function confetti(count = 140, origin?: { x: number; y: number }): void {
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  document.body.append(canvas);
  const g = canvas.getContext("2d")!;
  g.scale(devicePixelRatio, devicePixelRatio);
  const ox = origin?.x ?? innerWidth / 2;
  const oy = origin?.y ?? innerHeight * 0.35;
  const bits: Bit[] = Array.from({ length: count }, () => {
    const ang = Math.random() * Math.PI * 2;
    const sp = 4 + Math.random() * 9;
    return {
      x: ox, y: oy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 6, r: Math.random() * 6,
      spin: (Math.random() - 0.5) * 0.4, color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      w: 6 + Math.random() * 6, h: 3 + Math.random() * 4,
    };
  });
  const start = performance.now();
  const frame = (now: number) => {
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits) {
      b.vy += 0.28;
      b.vx *= 0.99;
      b.x += b.vx;
      b.y += b.vy;
      b.r += b.spin;
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.r);
      g.fillStyle = b.color;
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g.restore();
    }
    if (now - start < 3200) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

export function shake(el: HTMLElement | null): void {
  if (!el) return;
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
