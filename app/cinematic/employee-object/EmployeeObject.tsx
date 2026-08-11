"use client";

import { useRef } from "react";
import { useCanvasLoop } from "./useCanvasLoop";
import { drawEmberCore } from "./emberCore";
import { drawMemoryMark } from "./memoryMark";
import {
  plateFill,
  strokePolygon,
  drawRadialTicks,
  withShadow,
  morphQuad,
  squeezeQuadX,
  focusTargetCorners,
} from "./geometry";
import { BRASS, BRASS_DEEP, segment, outAndBackPulse, clamp01 } from "./tokens";
import {
  PANEL_COUNT,
  MEMORY_SLOT_COUNT,
  focusTargetFor,
  type EmployeeObjectProps,
} from "./state";

const R_SEAT = 0.13; // Mark's proportions: smaller housing, more negative space
const R_OUTER = 0.27;
const PANEL_GAP = 0.03;
const EXTEND_AMOUNT = 0.05; // Ledger's radial pop, at full amplitude

// Facet's lid-tilt: the outer edge narrows and pulls in, rather than
// the panel sliding straight out — never used together with `extend`
// by any phase below, but the geometry supports both at once.
function articulatedPanel(
  cx: number,
  cy: number,
  center: number,
  halfSpan: number,
  innerR: number,
  outerR: number,
  tilt: number
): [number, number][] {
  const outerHalfSpan = halfSpan * (1 - tilt * 0.55);
  const outerR2 = outerR * (1 - tilt * 0.12);
  const a1 = center - halfSpan;
  const a2 = center + halfSpan;
  const b1 = center - outerHalfSpan;
  const b2 = center + outerHalfSpan;
  return [
    [cx + Math.cos(a1) * innerR, cy + Math.sin(a1) * innerR],
    [cx + Math.cos(a2) * innerR, cy + Math.sin(a2) * innerR],
    [cx + Math.cos(b2) * outerR2, cy + Math.sin(b2) * outerR2],
    [cx + Math.cos(b1) * outerR2, cy + Math.sin(b1) * outerR2],
  ];
}

/**
 * The canonical Employee #001 object — locked visual direction, not a
 * variant. Every visual detail is a pure function of props except the
 * ember's own breathing, which runs on a continuous wall-clock and is
 * the one thing still alive when nothing else is happening. No prop
 * here is ever animated internally: the cinematic scroll timeline owns
 * `phaseProgress` (and `focus.amount`) completely and scrubs it forward
 * or backward with no internal state to fight.
 *
 * `focus` is additive: when omitted, or when `focus.amount === 0`, every
 * panel renders exactly as it always has — the base geometry is
 * untouched. Only when a panel is named as the cinematic subject does
 * it grow into the on-screen focus target while the other five recede.
 */
export default function EmployeeObject({
  phase,
  phaseProgress,
  activePanels = [],
  learningSlot,
  memory = [],
  trust = 0,
  focus,
}: EmployeeObjectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useCanvasLoop(canvasRef, (ctx, { t, width, height, reducedMotion }) => {
    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height);
    const p = clamp01(phaseProgress);
    const trustGlow = 0.55 + 0.45 * clamp01(trust);

    const focusAmount = focus ? clamp01(focus.amount) : 0;
    const squeezeX = focus?.squeezeX ?? 1;
    // The housing and ember step back as a panel takes over the frame —
    // "the camera travelling into Panel 1" reads as everything else
    // dimming, not just one thing growing.
    const presence = 1 - focusAmount * 0.75;

    // Fixed housing — always present, never articulates.
    const housingR = scale * (R_SEAT - 0.015);
    ctx.beginPath();
    ctx.arc(cx, cy, housingR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${BRASS}, ${0.5 * trustGlow * presence})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    drawRadialTicks(
      ctx,
      cx,
      cy,
      housingR,
      24,
      0,
      scale * 0.0045,
      `rgba(${BRASS}, ${0.32 * trustGlow * presence})`,
      1,
      6
    );

    // Memory — permanent marks already recorded, plus the one being
    // written right now. Never removed once appear reaches 1.
    for (let slot = 0; slot < MEMORY_SLOT_COUNT; slot++) {
      const recorded = memory.includes(slot);
      const writing = phase === "learn" && learningSlot === slot;
      if (!recorded && !writing) continue;

      const angle =
        ((slot + 0.5) / MEMORY_SLOT_COUNT) * Math.PI * 2 - Math.PI / 2;
      const appear = (recorded ? 1 : segment(p, 0, 0.6, reducedMotion)) * presence;
      const glint = (writing && !recorded ? Math.max(0, 1 - p / 0.5) : 0) * presence;
      drawMemoryMark(ctx, cx, cy, housingR, angle, scale, appear, glint);
    }

    const target = focus ? focusTargetCorners(width, height, focusTargetFor(width)) : null;

    // The six panels — individually addressable. Only the ones a phase
    // actually names ever move; the rest hold their seat. When `focus`
    // names a panel, that one instead morphs toward the on-screen
    // target and every other panel recedes toward the housing.
    for (let i = 0; i < PANEL_COUNT; i++) {
      const center = (i / PANEL_COUNT) * Math.PI * 2 - Math.PI / 2;
      const halfSpan = Math.PI / PANEL_COUNT - PANEL_GAP / 2;
      const isActive = activePanels.includes(i);
      const isFocused = focus && i === focus.panelIndex;

      const assembled =
        phase === "assemble" ? segment(p, i * 0.06, 0.5, reducedMotion) : 1;

      let extend = 0;
      let tilt = 0;

      if (!isFocused) {
        if (phase === "receive" && isActive) {
          tilt = outAndBackPulse(p, 0, 0.35, 0.25, 0.4, reducedMotion);
        } else if (phase === "reconfigure" && isActive) {
          const order = activePanels.indexOf(i);
          extend = outAndBackPulse(p, order * 0.12, 0.14, 0.05, 0.2, reducedMotion);
        } else if (phase === "execute") {
          extend = outAndBackPulse(p, 0, 0.4, 0.25, 0.35, reducedMotion);
        }
      }

      const baseOuterR = R_SEAT + (R_OUTER - R_SEAT) * assembled;
      let outerR = scale * (baseOuterR + extend * EXTEND_AMOUNT);
      const innerR = scale * R_SEAT;
      let alpha = 0.5 * trustGlow * (reducedMotion ? 1 : assembled);
      let fillBoost = 0;

      let pts = articulatedPanel(cx, cy, center, halfSpan, innerR, outerR, tilt);

      if (focus && target) {
        if (isFocused) {
          pts = morphQuad(pts, target, focusAmount);
          pts = squeezeQuadX(pts, squeezeX);
          alpha = alpha + (0.85 - alpha) * focusAmount;
          fillBoost = focusAmount * 0.18;
        } else {
          // Subordinate: same seat, but retracts and dims as the
          // takeover progresses — never relocated, just stepping back.
          const recededOuterR = outerR - (outerR - innerR) * focusAmount * 0.55;
          outerR = recededOuterR;
          pts = articulatedPanel(cx, cy, center, halfSpan, innerR, recededOuterR, tilt);
          alpha *= 1 - focusAmount * 0.75;
        }
      }

      withShadow(ctx, "rgba(0, 0, 0, 0.35)", 7, 2, () => {
        plateFill(ctx, pts, alpha * (0.12 + extend * 0.12 + tilt * 0.08) + fillBoost, BRASS_DEEP);
      });
      ctx.strokeStyle = `rgba(${BRASS_DEEP}, ${alpha})`;
      ctx.lineWidth = 1;
      strokePolygon(ctx, pts);

      if (tilt > 0.02 && !isFocused) {
        const h1x = cx + Math.cos(center - halfSpan) * innerR;
        const h1y = cy + Math.sin(center - halfSpan) * innerR;
        const h2x = cx + Math.cos(center + halfSpan) * innerR;
        const h2y = cy + Math.sin(center + halfSpan) * innerR;
        ctx.beginPath();
        ctx.moveTo(h1x, h1y);
        ctx.lineTo(h2x, h2y);
        ctx.strokeStyle = `rgba(${BRASS}, ${0.45 * tilt})`;
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    }

    const emberEntrance =
      (phase === "assemble" ? segment(p, 0, 0.4, reducedMotion) : 1) * presence;
    drawEmberCore(
      ctx,
      cx,
      cy,
      scale * 0.058 * (1 + 0.06 * clamp01(trust)),
      t,
      reducedMotion,
      emberEntrance,
      6
    );
  });

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
