import type { EmployeePhase, PanelFocus } from "./employee-object/state";
import { clamp01 } from "./employee-object/tokens";
import { panel1StateForChapterLocal, type Panel1State } from "./panel1";

export type ChapterField = { label: string; value: string };

export type ChapterDef = {
  id: string;
  panelIndex: number;
  eyebrow: string;
  heading: string;
  body: string;
  /** Only chapters still using the plain field-card treatment set this. */
  fields?: ChapterField[];
};

export type ChapterState = ChapterDef & { opacity: number };

export type SceneState = {
  phase: EmployeePhase;
  phaseProgress: number;
  focus: PanelFocus;
  trust: number;
  objectOpacity: number;
  cameraScale: number;
  backgroundWarmth: number; // 0..1, cool slate -> warm brass
  eyebrowOpacity: number;
  identityRoleOpacity: number;
  scrollHintOpacity: number;
  chapters: ChapterState[];
  /** Panel 1's invoice-arrival choreography — undefined outside its chapter. */
  panel1: Panel1State;
};

// Each panel is its own chapter. Order here is the order panels take
// over the frame — adding a panel 3-6 chapter later is purely a data
// change; the grammar (grow → hold → roll → next) doesn't change.
// Panel 1 (Invoices) no longer uses the plain field-card treatment —
// its content is the source-arrival sequence in panel1.ts instead.
// Panel 2 (Payments) is untouched, still field-card based.
export const CHAPTERS: ChapterDef[] = [
  {
    id: "invoices",
    panelIndex: 0,
    eyebrow: "Invoices",
    heading: "It reads every invoice the moment it arrives.",
    body: "Every invoice a customer sends — by email, message, or upload — is read and logged the instant it lands.",
  },
  {
    id: "payments",
    panelIndex: 1,
    eyebrow: "Payments",
    heading: "It tracks every payment against what's owed.",
    body: "Incoming payments are matched to open invoices automatically, closing the loop the moment cash lands.",
    fields: [
      { label: "Payment", value: "PMT-2291" },
      { label: "Applied to", value: "INV-10482" },
      { label: "Amount", value: "$18,400.00" },
      { label: "Received", value: "Sep 12" },
      { label: "Status", value: "Matched" },
    ],
  },
];

// Scroll-fraction zones for this sequence. Chapter 0 (Invoices) is
// substantially longer than before — it now hosts a multi-source
// arrival sequence rather than a single held card — and every zone
// after it is pushed later by exactly that difference. Chapter 1
// (Payments), the roll between them, reassembly, and identity all keep
// their *original absolute scroll distance* (see the film-track
// height change in page.tsx); only chapter 0 actually grew. Nothing
// about Panel 2's own timing or content changed — it just starts
// later in the overall journey.
const ZONES = {
  void: [0, 0.0231],
  arrive: [0.0231, 0.1077],
  openingHold: [0.1077, 0.1385],
  focusIn: [0.1385, 0.2308],
  chapter0: [0.2308, 0.5538],
  roll: [0.5538, 0.6308],
  chapter1: [0.6308, 0.7231],
  reassemble: [0.7231, 0.8615],
  identity: [0.8615, 1],
} as const satisfies Record<string, readonly [number, number]>;

function remap(f: number, [a, b]: readonly [number, number]) {
  return b > a ? clamp01((f - a) / (b - a)) : 0;
}

function interpolateKeyframes(f: number, keyframes: readonly (readonly [number, number])[]) {
  for (let i = 0; i < keyframes.length - 1; i++) {
    const [f0, v0] = keyframes[i];
    const [f1, v1] = keyframes[i + 1];
    if (f >= f0 && f <= f1) {
      const local = f1 > f0 ? (f - f0) / (f1 - f0) : 0;
      return v0 + (v1 - v0) * local;
    }
  }
  return keyframes[keyframes.length - 1][1];
}

function trapezoid(f: number, start: number, fadeIn: number, holdEnd: number, fadeOut: number) {
  if (f < start) return 0;
  if (f < start + fadeIn) return clamp01((f - start) / Math.max(fadeIn, 1e-6));
  if (f < holdEnd) return 1;
  if (fadeOut <= 0) return f < holdEnd ? 1 : 0;
  if (f < holdEnd + fadeOut) return clamp01(1 - (f - holdEnd) / fadeOut);
  return 0;
}

function baseAssembly(f: number): { phase: EmployeePhase; phaseProgress: number } {
  if (f < ZONES.arrive[0]) return { phase: "assemble", phaseProgress: 0 };
  if (f < ZONES.arrive[1]) return { phase: "assemble", phaseProgress: remap(f, ZONES.arrive) };
  return { phase: "rest", phaseProgress: 1 };
}

const VOID_TO_VISIBLE_SPAN = 0.046; // ~ the same absolute scroll distance as before

function objectOpacityFor(f: number) {
  if (f < ZONES.void[1]) return 0;
  if (f < ZONES.void[1] + VOID_TO_VISIBLE_SPAN) {
    return clamp01((f - ZONES.void[1]) / VOID_TO_VISIBLE_SPAN);
  }
  return 1;
}

// How "taken over" the composition is by any panel: 0 through the
// opening, ramping to 1 across focusIn, held through both chapters and
// the roll between them, then ramping back to 0 across reassembly.
function focusAmountFor(f: number) {
  if (f < ZONES.focusIn[0]) return 0;
  if (f < ZONES.focusIn[1]) return remap(f, ZONES.focusIn);
  if (f < ZONES.reassemble[0]) return 1;
  if (f < ZONES.reassemble[1]) return 1 - remap(f, ZONES.reassemble);
  return 0;
}

// Which panel is the current subject, and the roll's horizontal
// squeeze — 1 (normal) → 0 (edge-on, the hand-off instant) → 1 — with
// the subject switching from chapter 0's panel to chapter 1's panel
// exactly at the squeeze's zero point. During reassembly the subject
// stays chapter 1's panel, since it's the one shrinking back to its
// own seat.
function focusPanelFor(f: number): { panelIndex: number; squeezeX: number } {
  const first = CHAPTERS[0].panelIndex;
  const last = CHAPTERS[CHAPTERS.length - 1].panelIndex;

  if (f < ZONES.roll[0]) return { panelIndex: first, squeezeX: 1 };
  if (f < ZONES.roll[1]) {
    const local = remap(f, ZONES.roll);
    const squeezeX = Math.abs(Math.cos(local * Math.PI));
    return { panelIndex: local < 0.5 ? first : last, squeezeX };
  }
  return { panelIndex: last, squeezeX: 1 };
}

// Every keyframe below is expressed *from the zone boundaries*, not as
// independent hardcoded fractions — so if chapter 0's length (or any
// other zone's) ever changes again, camera/light/trust/identity timing
// stays correctly synced without manual recalculation.
const CAMERA_KEYFRAMES = [
  [0, 0.85],
  [ZONES.void[1], 0.85],
  [ZONES.arrive[1], 1.0],
  [ZONES.openingHold[1], 1.0],
  [ZONES.chapter0[0], 1.05],
  [ZONES.chapter1[1], 1.05],
  [ZONES.reassemble[1], 1.0],
  [1.0, 1.0],
] as const;

const WARMTH_KEYFRAMES = [
  [0, 0],
  [ZONES.arrive[1], 0],
  [ZONES.chapter0[0], 0.1],
  [ZONES.chapter1[1], 0.3],
  [ZONES.reassemble[1], 0.45],
  [1.0, 0.5],
] as const;

const TRUST_KEYFRAMES = [
  [0, 0],
  [ZONES.arrive[1], 0],
  [1.0, 0.28],
] as const;

// Proportional within the identity zone (22.2% / 44.4% through, same
// as the original design) rather than absolute, so identity's own
// internal pacing survives the zone renumbering above untouched.
const IDENTITY_SPAN = ZONES.identity[1] - ZONES.identity[0];
const IDENTITY_EYEBROW = {
  start: ZONES.identity[0] + IDENTITY_SPAN * 0.222,
  fadeIn: IDENTITY_SPAN * 0.222,
  holdEnd: 1.0,
  fadeOut: 0,
};
const IDENTITY_ROLE = {
  start: ZONES.identity[0] + IDENTITY_SPAN * 0.444,
  fadeIn: IDENTITY_SPAN * 0.278,
  holdEnd: 1.0,
  fadeOut: 0,
};

// Chapter 0's narrative no longer needs to wait for a field-card to
// finish morphing into place (there isn't one anymore) — it can appear
// as soon as the panel has settled, and holds for the entire (now much
// longer) arrival sequence. Chapter 1 is unchanged in every way except
// where it now falls in the overall timeline.
const ROLL_MID = (ZONES.roll[0] + ZONES.roll[1]) / 2;
function chapterOpacity(f: number, index: number) {
  if (index === 0) {
    return trapezoid(f, ZONES.focusIn[1], 0.02, ZONES.chapter0[1], 0.04);
  }
  if (index === 1) {
    return trapezoid(f, ROLL_MID, ZONES.roll[1] - ROLL_MID, ZONES.chapter1[1], 0.046);
  }
  return 0;
}

export function sceneForFraction(rawF: number, reducedMotion = false): SceneState {
  const f = clamp01(rawF);
  const { phase, phaseProgress } = baseAssembly(f);

  // The panel takeover is the single largest motion source in this
  // sequence — a small element growing to half the viewport. Under
  // reduced motion it snaps rather than animates continuously: no
  // partial-grow, no squeeze/roll. The DOM field card (chapter 1) is
  // positioned at the *final* target rect, so `amount` must be binary
  // here too, or the card would show at full position while the canvas
  // panel is still mid-morph.
  const rawAmount = focusAmountFor(f);
  const amount = reducedMotion ? (rawAmount > 0.5 ? 1 : 0) : rawAmount;
  const rawPanel = focusPanelFor(f);
  const squeezeX = reducedMotion ? 1 : rawPanel.squeezeX;
  const focus: PanelFocus = { panelIndex: rawPanel.panelIndex, amount, squeezeX };

  const rawScale = interpolateKeyframes(f, CAMERA_KEYFRAMES);
  const cameraScale = reducedMotion ? 1 + (rawScale - 1) * 0.3 : rawScale;

  // Chapter visibility is derived from the same amount/panelIndex the
  // canvas just used, not recomputed from `f` independently — under
  // reduced motion this guarantees the DOM narrative and the canvas
  // panel agree by construction rather than by matching two sets of
  // hand-tuned thresholds.
  const chapters: ChapterState[] = CHAPTERS.map((c, i) => {
    const isCurrentSubject = amount > 0.5 && focus.panelIndex === c.panelIndex;
    const opacity = reducedMotion ? (isCurrentSubject ? 1 : 0) : chapterOpacity(f, i);
    return { ...c, opacity };
  });

  const chapter0Local = remap(f, ZONES.chapter0);
  const panel1 = panel1StateForChapterLocal(chapter0Local, reducedMotion);

  const baseTrust = interpolateKeyframes(f, TRUST_KEYFRAMES);
  const trust = clamp01(baseTrust + panel1.trustBump);

  return {
    phase,
    phaseProgress,
    focus,
    trust,
    objectOpacity: objectOpacityFor(f),
    cameraScale,
    backgroundWarmth: interpolateKeyframes(f, WARMTH_KEYFRAMES),
    eyebrowOpacity: trapezoid(f, IDENTITY_EYEBROW.start, IDENTITY_EYEBROW.fadeIn, IDENTITY_EYEBROW.holdEnd, IDENTITY_EYEBROW.fadeOut),
    identityRoleOpacity: trapezoid(f, IDENTITY_ROLE.start, IDENTITY_ROLE.fadeIn, IDENTITY_ROLE.holdEnd, IDENTITY_ROLE.fadeOut),
    scrollHintOpacity: clamp01(1 - f / 0.02),
    chapters,
    panel1,
  };
}
