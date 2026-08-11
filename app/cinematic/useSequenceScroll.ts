"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { sceneForFraction, type SceneState } from "./sceneState";
import { clamp01 } from "./employee-object/tokens";

// Locked from the scroll-camera prototype round: a critically-damped
// follow, not raw 1:1 and not discrete detents. The object trails
// scroll position slightly (apple-design's response principle) so the
// film has physical weight, but every frame is still a pure function
// of native scroll position — never disconnected from it, never
// animating on its own once scrolling stops.
const DAMPING = 0.14;

/**
 * Reads native scroll position against a tall pinned section and turns
 * it into the full scene state for this sequence, every frame. This is
 * the only place raw scroll is read — everything downstream (camera,
 * the object's panel focus, chapter narrative, lighting) derives from
 * the same single damped value, so nothing can drift out of sync.
 */
export function useSequenceScroll(
  containerRef: RefObject<HTMLDivElement | null>
): SceneState {
  const rawRef = useRef(0);
  const displayedRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const [scene, setScene] = useState<SceneState>(() => sceneForFraction(0));

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    function measure() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollable = el.offsetHeight - window.innerHeight;
      rawRef.current = scrollable > 0 ? clamp01(-rect.top / scrollable) : 0;
    }
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);

    let raf = 0;
    function frame() {
      const target = rawRef.current;
      if (reducedMotionRef.current) {
        displayedRef.current = target; // no trailing lag for reduced-motion users
      } else {
        displayedRef.current += (target - displayedRef.current) * DAMPING;
        if (Math.abs(target - displayedRef.current) < 0.0004) {
          displayedRef.current = target;
        }
      }
      setScene(sceneForFraction(displayedRef.current, reducedMotionRef.current));
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(raf);
    };
  }, [containerRef]);

  return scene;
}
