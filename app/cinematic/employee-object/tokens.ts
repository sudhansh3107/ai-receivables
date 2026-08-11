// Shared constants for the canonical Employee #001 object — promoted
// out of app/prototypes/employee-001 now that it's part of the real
// build, not exploration. The brass language and easing curves are
// held constant here so every consumer stays visually consistent.

export const BRASS = "217, 174, 103"; // #D9AE67 — existing app accent
export const BRASS_DEEP = "184, 137, 69"; // #B88945 — existing app accent
export const WARM_WHITE = "255, 240, 214";

export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeInCubic = (x: number) => x * x * x;
export const easeInOutCubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// A small mechanical overshoot — used only for "seats" and "locks": a
// panel or tumbler that settles slightly past its resting point before
// coming to rest, the way a real latch clicks home.
export const easeOutBack = (x: number, overshoot = 1.5) => {
  const c1 = overshoot;
  const c3 = c1 + 1;
  const p = x - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
};

/**
 * Maps t onto a single named phase's 0..1 progress: 0 before `start`,
 * eased across `duration`, held at 1 after. Every hybrid variant's
 * timeline is built by composing several of these — assembly, then one
 * decisive event, then stillness — never a perpetual loop.
 */
export function segment(
  t: number,
  start: number,
  duration: number,
  reducedMotion: boolean,
  ease: (x: number) => number = easeOutCubic
) {
  if (reducedMotion) return 1;
  if (t < start) return 0;
  return ease(clamp01((t - start) / duration));
}

/**
 * A single "push out, hold, and firmly return" gesture — 0 at rest,
 * rising to 1, holding, then settling back to 0 with a small mechanical
 * overshoot. The building block for every open/lock/pop event across
 * the hybrid variants; under reduced motion it never fires at all.
 */
export function outAndBackPulse(
  t: number,
  start: number,
  outDuration: number,
  holdDuration: number,
  backDuration: number,
  reducedMotion: boolean
) {
  if (reducedMotion) return 0;
  const outEnd = start + outDuration;
  const holdEnd = outEnd + holdDuration;
  const backEnd = holdEnd + backDuration;
  if (t < start) return 0;
  if (t < outEnd) return easeOutCubic(clamp01((t - start) / outDuration));
  if (t < holdEnd) return 1;
  if (t < backEnd)
    return clamp01(1 - easeOutBack(clamp01((t - holdEnd) / backDuration)));
  return 0;
}
