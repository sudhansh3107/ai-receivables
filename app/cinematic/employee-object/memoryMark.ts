import { WARM_WHITE } from "./tokens";

/**
 * The Cryptex-borrowed idea, reduced to its essence: a single mark on
 * the fixed housing. Pure and stateless — the caller decides `appear`
 * (0..1, how permanently recorded this mark is) and `glint` (0..1, a
 * transient flash at the instant it's written). A mark that has already
 * been learned is drawn with appear=1, glint=0 and never moves again.
 */
export function drawMemoryMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  angle: number,
  scale: number,
  appear: number,
  glint: number
) {
  if (appear <= 0.01 && glint <= 0.01) return;

  if (glint > 0.02) {
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(angle) * r,
      cy + Math.sin(angle) * r,
      scale * 0.022 * glint,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = `rgba(${WARM_WHITE}, ${0.5 * glint})`;
    ctx.fill();
  }

  const x1 = cx + Math.cos(angle) * (r - scale * 0.01);
  const y1 = cy + Math.sin(angle) * (r - scale * 0.01);
  const x2 = cx + Math.cos(angle) * (r + scale * 0.022);
  const y2 = cy + Math.sin(angle) * (r + scale * 0.022);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = `rgba(${WARM_WHITE}, ${0.9 * appear})`;
  ctx.lineWidth = 1.8;
  ctx.stroke();
}
