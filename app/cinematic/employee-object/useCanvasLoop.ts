"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export type DrawFrame = {
  t: number;
  dt: number;
  width: number;
  height: number;
  reducedMotion: boolean;
};

type DrawFn = (ctx: CanvasRenderingContext2D, frame: DrawFrame) => void;

/**
 * Drives a rAF render loop against a canvas, DPR-aware and resize-aware.
 * `draw` is captured in a ref so identity changes never restart the loop —
 * the loop (and its `t=0` origin) lives for the lifetime of the mounted canvas,
 * which is what lets remounting a variant replay its entrance.
 */
export function useCanvasLoop(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  draw: DrawFn
) {
  const drawRef = useRef(draw);
  // Refs can't be written during render (React 19 flags it) — keep the
  // latest `draw` closure fresh via a layout effect instead, which
  // still lands synchronously before the next paint/rAF frame.
  useLayoutEffect(() => {
    drawRef.current = draw;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    function resize() {
      // offsetWidth/offsetHeight, not getBoundingClientRect — the latter
      // includes any CSS transform on this element or an ancestor (e.g.
      // the cinematic camera's scale()), which would bake a stale zoom
      // level into the canvas's drawing buffer since ResizeObserver only
      // fires on real layout changes, never on transform-only ones.
      width = canvas!.offsetWidth;
      height = canvas!.offsetHeight;
      canvas!.width = Math.max(1, Math.round(width * dpr));
      canvas!.height = Math.max(1, Math.round(height * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    const start = performance.now();
    let last = start;

    function frame(now: number) {
      const t = (now - start) / 1000;
      const dt = (now - last) / 1000;
      last = now;
      ctx!.clearRect(0, 0, width, height);
      drawRef.current(ctx!, { t, dt, width, height, reducedMotion });
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [canvasRef]);
}
