import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import { sfx } from "./fx";

gsap.registerPlugin(SplitText);
export { gsap };

/** Letters drop in one by one, oversized and spinning, then settle. */
export function slam(el: Element, stagger = 0.035): gsap.core.Timeline {
  const split = SplitText.create(el, { type: "chars", charsClass: "ch" });
  return gsap.timeline().from(split.chars, {
    scale: 3.2, opacity: 0, y: -60,
    rotation: () => gsap.utils.random(-35, 35),
    duration: 0.45, ease: "back.out(2.2)", stagger,
  });
}

/** Gentle endless wobble for headline cards (Double Feature). */
export const wobble = (el: Element): gsap.core.Tween =>
  gsap.to(el, { rotation: -2, scale: 1.04, duration: 0.6, ease: "sine.inOut", yoyo: true, repeat: -1 });

/** Counts an element's text up with a tick per step. */
export function counter(el: HTMLElement, from: number, to: number, duration = 0.7, fmt = (n: number) => String(n)): gsap.core.Tween {
  const o = { v: from };
  let last = from;
  el.textContent = fmt(from);
  return gsap.to(o, {
    v: to, duration, ease: "power2.out",
    onUpdate: () => {
      const v = Math.round(o.v);
      if (v !== last) sfx.tick();
      last = v;
      el.textContent = fmt(v);
    },
  });
}

/** The title splat: lands big and tilted, squashes, then settles. */
export function splat(el: HTMLElement): gsap.core.Timeline {
  gsap.set(el, { xPercent: -50, yPercent: -50 });
  return gsap.timeline()
    .from(el, { scale: 2.8, rotation: -16, opacity: 0, duration: 0.3, ease: "power4.in" })
    .to(el, { scaleX: 1.12, scaleY: 0.86, duration: 0.08, ease: "power1.out" })
    .to(el, { scaleX: 1, scaleY: 1, rotation: -4, duration: 0.5, ease: "elastic.out(1, 0.45)" });
}

/** "+3" floating up off an element. */
export function popPoints(near: HTMLElement, text: string): void {
  const r = near.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "pop";
  el.textContent = text;
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.top + r.height / 2}px`;
  document.body.append(el);
  gsap.timeline({ onComplete: () => el.remove() })
    .set(el, { xPercent: -50, yPercent: -50 })
    .from(el, { scale: 0.3, opacity: 0, duration: 0.25, ease: "back.out(3)" })
    .to(el, { yPercent: -180, opacity: 0, duration: 0.85, ease: "power1.in" }, "+=0.15");
}

/** Rows or tiles rising in one after another. */
export const stagger = (els: string | Element[], delay = 0): gsap.core.Tween =>
  gsap.from(els, { y: 14, opacity: 0, duration: 0.35, ease: "power2.out", stagger: 0.05, delay });
