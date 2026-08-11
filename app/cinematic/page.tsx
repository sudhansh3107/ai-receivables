"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Mail, MessageCircle, Upload, FileText, RefreshCw } from "lucide-react";
import EmployeeObject from "./employee-object/EmployeeObject";
import { focusTargetFor, type FocusTarget } from "./employee-object/state";
import { easeInCubic, easeInOutCubic, clamp01 } from "./employee-object/tokens";
import { useSequenceScroll } from "./useSequenceScroll";
import type { SourceKind } from "./panel1";

// The first real cinematic sequence, second architecture: the object
// itself never leaves the screen or resets. One of its six panels
// becomes the cinematic subject — grows, takes the left/primary
// position, and hosts the capability being explained — then rolls
// directly into the next panel's takeover. Only after the last
// configured chapter does the composition reassemble into the full
// object. Isolated from Mission Control and the rest of the future
// homepage; scroll position is the only timeline.

// Panel 1 is the complete visual stage for this chapter: every invoice
// originates *inside* the panel's own bounds, travels to its own
// locked cell in the collection grid, and — once the whole collection
// is assembled and held — the entire group is pulled toward the
// panel's own center as one synchronized motion. Six slots arranged
// well inside the target rect's edges. Positions are fractions of the
// target's own half-width/half-height, so this scales correctly for
// the mobile target too without a separate mobile-specific layout.
const ORIGIN_SLOTS: readonly { dx: number; dy: number }[] = [
  { dx: -0.38, dy: -0.5 },
  { dx: 0.38, dy: -0.5 },
  { dx: -0.44, dy: 0.05 },
  { dx: 0.44, dy: 0.05 },
  { dx: -0.38, dy: 0.5 },
  { dx: 0.38, dy: 0.5 },
];

function sourcePoints(target: FocusTarget) {
  const halfW = target.wFrac / 2;
  const halfH = target.hFrac / 2;
  return ORIGIN_SLOTS.map(({ dx, dy }) => ({
    xFrac: target.xFrac + dx * halfW,
    yFrac: target.yFrac + dy * halfH,
  }));
}

// Where each invoice locks once it arrives — a grid, not a single
// column, since a full invoice card needs more room than one line did.
// Spacing is derived from the panel's own dimensions divided by the
// grid size, so it self-adjusts for any viewport rather than relying
// on hand-tuned per-breakpoint numbers.
function gridPosition(target: FocusTarget, index: number, cols: number, rows: number) {
  const col = index % cols;
  const row = Math.floor(index / cols);
  const colSpacing = (target.wFrac / cols) * 0.68;
  const rowSpacing = (target.hFrac / rows) * 0.62;
  return {
    xFrac: target.xFrac + (col - (cols - 1) / 2) * colSpacing,
    yFrac: target.yFrac + (row - (rows - 1) / 2) * rowSpacing,
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Three shape families carry five source kinds — enough visual variety
// to read as distinct real-world artifacts without inventing a bespoke
// treatment per kind, which starts to look like a dashboard.
const SHAPE_BY_KIND: Record<SourceKind, "plain" | "bubble" | "paper"> = {
  email: "plain",
  erp: "plain",
  whatsapp: "bubble",
  pdf: "paper",
  upload: "paper",
};

function SourceIcon({ kind }: { kind: SourceKind }) {
  if (kind === "email") return <Mail size={11} strokeWidth={1.5} />;
  if (kind === "whatsapp") return <MessageCircle size={11} strokeWidth={1.5} />;
  if (kind === "upload") return <Upload size={11} strokeWidth={1.5} />;
  if (kind === "erp") return <RefreshCw size={11} strokeWidth={1.5} />;
  return <FileText size={11} strokeWidth={1.5} />;
}

export default function CinematicSequence() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scene = useSequenceScroll(containerRef);

  const [viewportWidth, setViewportWidth] = useState(1280);
  useEffect(() => {
    function measure() {
      setViewportWidth(window.innerWidth);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // The exact same rect the canvas grows the focused panel into — one
  // function, so the DOM content never has to be hand-aligned to it.
  const target = focusTargetFor(viewportWidth);
  const isMobile = viewportWidth < 720;
  const origins = sourcePoints(target);
  // Desktop's target is portrait-ish (taller than wide) — 2 columns x
  // 3 rows fits it. Mobile's target is the opposite (wide, short) — 3
  // columns x 2 rows fits that instead.
  const gridCols = isMobile ? 3 : 2;
  const gridRows = isMobile ? 2 : 3;

  const cool: [number, number, number] = [78, 90, 102];
  const warm: [number, number, number] = [217, 174, 103];
  const tint = cool.map((v, i) => Math.round(v + (warm[i] - v) * scene.backgroundWarmth));

  const fieldRectStyle: CSSProperties = {
    left: `${(target.xFrac - target.wFrac / 2) * 100}%`,
    top: `${(target.yFrac - target.hFrac / 2) * 100}%`,
    width: `${target.wFrac * 100}%`,
    height: `${target.hFrac * 100}%`,
  };

  const wrap = scene.panel1.wrapProgress;
  const wrapEase = easeInCubic(wrap);
  const wrapScale = 1 - wrapEase * 0.85;
  const wrapTextOpacity = 1 - clamp01((wrap - 0.55) / 0.45);
  const wrapIconOpacity = 1 - clamp01(wrap / 0.5);

  return (
    <div className="film-root">
      <div ref={containerRef} className="film-track">
        <div className="film-pinned">
          <div
            className="film-vignette"
            style={{
              background: `radial-gradient(ellipse 90% 70% at 50% 45%, rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, 0.16), transparent 60%)`,
            }}
          />

          {/* Chapter overlays live inside the same scaled/faded stage as the
              canvas, not as unscaled siblings — cameraScale (e.g. 1.05
              through the chapters) would otherwise pull the canvas-drawn
              panel and this DOM content visibly out of alignment. */}
          <div
            className="film-stage"
            style={{ opacity: scene.objectOpacity, transform: `scale(${scene.cameraScale})` }}
          >
            <EmployeeObject
              phase={scene.phase}
              phaseProgress={scene.phaseProgress}
              trust={scene.trust}
              focus={scene.focus}
            />

            {/* The Ember's single reaction to the whole collection being
                absorbed — a separate DOM overlay positioned at the
                panel's own center, not a change to the canvas object
                itself. Timed to the wrap, not to individual invoices. */}
            <div
              className="ember-pulse"
              style={{
                left: `${target.xFrac * 100}%`,
                top: `${target.yFrac * 100}%`,
                opacity: scene.panel1.emberPulse * 0.7,
                transform: `translate(-50%, -50%) scale(${1 + scene.panel1.emberPulse * 0.5})`,
              }}
            />

            {scene.chapters.map((c) => (
              <div key={c.id} className="chapter" style={{ opacity: c.opacity }} aria-hidden={c.opacity < 0.05}>
                {c.fields && (
                  <div className="chapter-fields" style={fieldRectStyle}>
                    <div className="chapter-fields-inner">
                      {c.fields.map((row) => (
                        <div key={row.label} className="field-row">
                          <span className="field-label">{row.label}</span>
                          <span className="field-value">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {c.id === "invoices" &&
                  scene.panel1.invoices.map((inv, i) => {
                    const origin = origins[i];
                    const locked = gridPosition(target, i, gridCols, gridRows);
                    const center = { xFrac: target.xFrac, yFrac: target.yFrac };

                    const arriveEase = easeInOutCubic(inv.arrivalT);
                    const arrivedPos = {
                      xFrac: lerp(origin.xFrac, locked.xFrac, arriveEase),
                      yFrac: lerp(origin.yFrac, locked.yFrac, arriveEase),
                    };
                    // Once the wrap begins, every invoice shares the
                    // exact same destination and the exact same
                    // progress curve — the collection moves as one
                    // synchronized group, not six separate absorptions.
                    const pos =
                      wrap > 0
                        ? {
                            xFrac: lerp(locked.xFrac, center.xFrac, wrapEase),
                            yFrac: lerp(locked.yFrac, center.yFrac, wrapEase),
                          }
                        : arrivedPos;

                    const textOpacity = inv.arrivalOpacity * wrapTextOpacity;
                    const iconOpacity = inv.arrivalOpacity * wrapIconOpacity;
                    const flashBrightness = 1 + inv.lockFlash * 0.6;

                    return (
                      <div
                        key={inv.id}
                        className={`invoice-card invoice-card--${SHAPE_BY_KIND[inv.kind]}`}
                        style={{
                          left: `${pos.xFrac * 100}%`,
                          top: `${pos.yFrac * 100}%`,
                          transform: `translate(-50%, -50%) scale(${wrap > 0 ? wrapScale : 1})`,
                        }}
                        aria-hidden={textOpacity < 0.05}
                      >
                        <span className="invoice-card-icon" style={{ opacity: iconOpacity }}>
                          <SourceIcon kind={inv.kind} />
                        </span>
                        <span
                          className="invoice-card-lines"
                          style={{
                            opacity: textOpacity,
                            filter: inv.lockFlash > 0.03 ? `brightness(${flashBrightness})` : undefined,
                          }}
                        >
                          <span className="invoice-card-no">{inv.invoiceNo}</span>
                          <span className="invoice-card-customer">{inv.customer}</span>
                          <span className="invoice-card-amount">{inv.amount}</span>
                          <span className="invoice-card-tag">{inv.tag}</span>
                        </span>
                      </div>
                    );
                  })}

                <div className={`chapter-narrative ${isMobile ? "is-mobile" : ""}`}>
                  <div className="chapter-eyebrow">{c.eyebrow}</div>
                  <div className="chapter-heading">{c.heading}</div>
                  <div className="chapter-body">{c.body}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="film-identity">
            <div className="film-eyebrow" style={{ opacity: scene.eyebrowOpacity }}>
              Employee #001
            </div>
            <div className="film-role" style={{ opacity: scene.identityRoleOpacity }}>
              Accounts Receivable
            </div>
          </div>

          <div className="film-hint" style={{ opacity: scene.scrollHintOpacity }}>
            Scroll
          </div>
        </div>
      </div>

      <style>{`
        .film-root {
          background: #100E0B;
        }

        .film-track {
          height: 520vh;
          position: relative;
        }

        @media (max-width: 720px) {
          .film-track {
            height: 340vh;
          }
        }

        .film-pinned {
          position: sticky;
          top: 0;
          height: 100vh;
          overflow: hidden;
          background: radial-gradient(ellipse 140% 140% at 50% 50%, #16130F 0%, #0B0A08 100%);
        }

        .film-vignette {
          position: absolute;
          inset: 0;
          pointer-events: none;
          transition: background 200ms linear;
        }

        .film-stage {
          position: absolute;
          inset: 0;
          will-change: transform, opacity;
        }

        .ember-pulse {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 5vmin;
          height: 5vmin;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 240, 214, 0.9) 0%, rgba(217, 174, 103, 0.4) 45%, transparent 75%);
          pointer-events: none;
          will-change: transform, opacity;
        }

        .chapter {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .chapter-fields {
          position: absolute;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chapter-fields-inner {
          background: rgba(11, 10, 8, 0.55);
          border: 1px solid rgba(217, 174, 103, 0.22);
          border-radius: 4px;
          padding: 20px 26px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-width: 220px;
        }

        .field-row {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          font-family: -apple-system, "Segoe UI", sans-serif;
          font-size: 13px;
        }

        .field-label {
          color: rgba(217, 174, 103, 0.7);
          letter-spacing: 0.04em;
        }

        .field-value {
          color: rgba(241, 235, 221, 0.92);
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-variant-numeric: tabular-nums;
        }

        /* One invoice of the assembling collection — icon (its source
           channel) plus four compact lines, positioned absolutely so
           it can travel from its origin and lock into its grid cell.
           Restrained: no drop shadows, no gradients, just enough
           structure to read as a real record. */
        .invoice-card {
          position: absolute;
          display: flex;
          align-items: flex-start;
          gap: 6px;
          width: max-content;
          max-width: min(128px, 30vw);
          will-change: transform;
        }

        .invoice-card-icon {
          display: flex;
          color: rgba(217, 174, 103, 0.75);
          flex-shrink: 0;
          margin-top: 2px;
        }

        .invoice-card-lines {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .invoice-card-no {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 10.5px;
          letter-spacing: 0.01em;
          color: rgba(241, 235, 221, 0.92);
          white-space: nowrap;
        }

        .invoice-card-customer {
          font-family: -apple-system, "Segoe UI", sans-serif;
          font-size: 10px;
          line-height: 1.25;
          color: rgba(200, 194, 182, 0.85);
        }

        .invoice-card-amount {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 10.5px;
          font-variant-numeric: tabular-nums;
          color: rgba(217, 174, 103, 0.9);
          white-space: nowrap;
        }

        .invoice-card-tag {
          font-family: -apple-system, "Segoe UI", sans-serif;
          font-size: 9px;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          color: rgba(217, 174, 103, 0.55);
          white-space: nowrap;
        }

        /* Plain (email, accounting sync): a thin baseline rule under
           the card — the least "designed" of the three, like a row
           glimpsed in a list. */
        .invoice-card--plain {
          padding-bottom: 5px;
          border-bottom: 1px solid rgba(217, 174, 103, 0.22);
        }

        /* Bubble (WhatsApp): the one shape that's genuinely a bubble in
           real life, so a subtle bubble reads as observation, not
           decoration. */
        .invoice-card--bubble {
          background: rgba(17, 15, 12, 0.5);
          border: 1px solid rgba(217, 174, 103, 0.18);
          border-radius: 8px 8px 8px 2px;
          padding: 6px 9px;
        }

        /* Paper (PDF, upload): a folded corner, the one visual cue
           everyone already reads as "document". */
        .invoice-card--paper {
          padding: 5px 8px 5px 0;
          position: relative;
        }

        .invoice-card--paper::before {
          content: "";
          position: absolute;
          top: -2px;
          left: -15px;
          width: 10px;
          height: 10px;
          border: 1px solid rgba(217, 174, 103, 0.3);
          border-radius: 2px;
          clip-path: polygon(0 0, 70% 0, 100% 30%, 100% 100%, 0 100%);
        }

        .chapter-narrative {
          position: absolute;
          left: 58%;
          right: 6%;
          top: 50%;
          transform: translateY(-50%);
          max-width: 40ch;
        }

        .chapter-narrative.is-mobile {
          position: absolute;
          left: 8%;
          right: 8%;
          top: 58%;
          transform: none;
          max-width: none;
        }

        .chapter-eyebrow {
          font-family: -apple-system, "Segoe UI", sans-serif;
          font-size: 11.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(217, 174, 103, 0.85);
          margin-bottom: 10px;
        }

        .chapter-heading {
          font-family: "Iowan Old Style", "Palatino Linotype", Georgia, "Times New Roman", serif;
          font-size: clamp(19px, 2.2vw, 27px);
          line-height: 1.3;
          letter-spacing: -0.01em;
          color: rgba(241, 235, 221, 0.94);
          margin-bottom: 14px;
        }

        .chapter-body {
          font-family: -apple-system, "Segoe UI", sans-serif;
          font-size: 14px;
          line-height: 1.55;
          color: rgba(200, 194, 182, 0.75);
        }

        .film-identity {
          position: absolute;
          left: 6%;
          bottom: 16%;
          pointer-events: none;
        }

        .film-eyebrow {
          font-family: -apple-system, "Segoe UI", sans-serif;
          font-size: 11.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(217, 174, 103, 0.85);
          margin-bottom: 8px;
        }

        .film-role {
          font-family: "Iowan Old Style", "Palatino Linotype", Georgia, "Times New Roman", serif;
          font-size: clamp(22px, 3.2vw, 34px);
          letter-spacing: -0.01em;
          color: rgba(241, 235, 221, 0.92);
        }

        .film-hint {
          position: absolute;
          left: 50%;
          bottom: 7%;
          transform: translateX(-50%);
          font-family: -apple-system, "Segoe UI", sans-serif;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(241, 235, 221, 0.35);
          pointer-events: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .film-stage {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
