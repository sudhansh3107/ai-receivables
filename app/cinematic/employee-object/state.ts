// The canonical Employee #001 object's control surface. This is the
// contract the cinematic scroll timeline programs against: at any
// instant, compute a `phase` and a `phaseProgress` (0..1, fully
// external — never animated internally by the object) and the object
// renders that instant exactly, in either direction.

export const PANEL_COUNT = 6;
export const MEMORY_SLOT_COUNT = 6; // one candidate mark between each pair of panels

export type EmployeePhase =
  | "rest" // flush, closed, still — the default
  | "assemble" // panels grow from collapsed to flush; the object arriving
  | "receive" // one or two panels tilt open, restrained — taking something in
  | "reconfigure" // several panels pop in sequence — reorganizing
  | "execute" // all six panels move together, once, decisively
  | "learn"; // a memory mark is written to the fixed housing, permanently

export type EmployeeObjectProps = {
  phase: EmployeePhase;
  /** 0..1 progress through the current phase's gesture. Owned by the caller. */
  phaseProgress: number;
  /** Panel indices (0..5) that participate in `receive` / `reconfigure`. `execute` always uses all six. */
  activePanels?: number[];
  /** Memory slot (0..5) currently being written, when `phase === "learn"`. */
  learningSlot?: number;
  /** Memory slots already permanently recorded from earlier `learn` events. */
  memory?: number[];
  /** 0..1 persistent confidence level, independent of `phase` — not a gesture, a standing state. */
  trust?: number;
  /**
   * Optional cinematic takeover: one panel grows into a large on-screen
   * focus target while the other five recede. Omit (or pass
   * amount: 0) for the object's normal composition — the geometry and
   * every other phase are unchanged by this prop's existence.
   */
  focus?: PanelFocus;
};

export type PanelFocus = {
  /** Which panel (0..5) is the current cinematic subject. */
  panelIndex: number;
  /** 0 = natural polar position/size, 1 = fully at the on-screen focus target. */
  amount: number;
  /** Horizontal squeeze at the target position — 1 = normal, 0 = edge-on. Used for the panel-to-panel roll transition; defaults to 1. */
  squeezeX?: number;
};

export type FocusTarget = {
  xFrac: number;
  yFrac: number;
  wFrac: number;
  hFrac: number;
};

// Desktop: the focused panel occupies roughly the left half, leaving
// room for the narrative on the right. Mobile: it takes the upper
// portion of the viewport, full-width, with narrative below —
// "repositioned appropriately," not simply shrunk.
export const FOCUS_TARGET_DESKTOP: FocusTarget = { xFrac: 0.29, yFrac: 0.5, wFrac: 0.4, hFrac: 0.58 };
export const FOCUS_TARGET_MOBILE: FocusTarget = { xFrac: 0.5, yFrac: 0.34, wFrac: 0.8, hFrac: 0.36 };
export const MOBILE_BREAKPOINT = 720;

export function focusTargetFor(width: number): FocusTarget {
  return width < MOBILE_BREAKPOINT ? FOCUS_TARGET_MOBILE : FOCUS_TARGET_DESKTOP;
}
