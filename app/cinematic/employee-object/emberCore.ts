import { BRASS, WARM_WHITE } from "./tokens";

const PULSE_PERIOD = 2.8; // seconds — matches the existing .employee-indicator pulse

/**
 * The "life" ingredient: a breathing, warm core with an occasional
 * expanding pulse. Structure is what diverges between variants; this
 * stays constant so the object always reads as alive because of the
 * same internal core, however it's housed.
 */
export function drawEmberCore(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  baseR: number,
  t: number,
  reducedMotion: boolean,
  entrance: number,
  glowFactor = 6
) {
  if (!reducedMotion && entrance > 0.3) {
    const cycles = Math.floor(t / PULSE_PERIOD) + 1;
    for (let i = 0; i < cycles; i++) {
      const age = t - i * PULSE_PERIOD;
      if (age < 0 || age > PULSE_PERIOD * 0.7) continue;
      const p = Math.min(1, Math.max(0, age / (PULSE_PERIOD * 0.7)));
      const ease = 1 - Math.pow(1 - p, 2);
      const r = baseR * (1 + ease * 2.2) * entrance;
      const alpha = 0.4 * (1 - p) * entrance;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${BRASS}, ${alpha})`;
      ctx.fill();
    }
  }

  const breathe = reducedMotion
    ? 1
    : 1 + 0.14 * (0.5 + 0.5 * Math.sin((t / PULSE_PERIOD) * Math.PI * 2));
  const coreAlpha = reducedMotion
    ? 0.75 + 0.15 * Math.sin(t * 0.3)
    : (0.7 + (0.3 * (breathe - 1)) / 0.14) * entrance;

  const r = baseR * (reducedMotion ? 1 : breathe) * (0.35 + 0.65 * entrance);

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * glowFactor);
  glow.addColorStop(0, `rgba(${BRASS}, ${coreAlpha * 0.55})`);
  glow.addColorStop(0.35, `rgba(${BRASS}, ${coreAlpha * 0.16})`);
  glow.addColorStop(1, "rgba(217, 174, 103, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * glowFactor, 0, Math.PI * 2);
  ctx.fill();

  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  core.addColorStop(0, `rgba(${WARM_WHITE}, ${coreAlpha})`);
  core.addColorStop(1, `rgba(${BRASS}, ${coreAlpha * 0.85})`);
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  return r;
}
