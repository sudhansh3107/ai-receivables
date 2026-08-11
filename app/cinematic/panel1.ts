import { clamp01 } from "./employee-object/tokens";

// Panel 1's story, corrected again: six DISTINCT invoices — different
// invoice numbers, different customers, different amounts — not six
// fields of one invoice and not six copies of the same one. Each
// emerges from a different believable AR channel, travels into the
// enlarged panel, and locks into a clean structured collection. The
// collection holds, then the whole group — as one, not six separate
// absorptions — contracts and flows into the Ember. Pure and
// width-agnostic like the rest of the scene: this only computes *when*
// things happen; page.tsx maps that onto actual screen positions
// confined entirely within the panel's own bounds.

export type SourceKind = "email" | "whatsapp" | "upload" | "pdf" | "erp";

export type InvoiceDef = {
  id: string;
  kind: SourceKind;
  invoiceNo: string;
  customer: string;
  amount: string;
  /** Either an "Outstanding" status or a due date — varies per invoice, like real records do. */
  tag: string;
};

export type InvoiceRenderState = InvoiceDef & {
  /** 0 while off, ramps to 1 as it arrives, then holds at 1 — invoices never fade out individually. */
  arrivalOpacity: number;
  /** 0 = still at its source, 1 = locked into the collection. */
  arrivalT: number;
  /** 0..1, a brief highlight right as this invoice clicks into alignment. */
  lockFlash: number;
};

export type Panel1State = {
  invoices: InvoiceRenderState[];
  /** 0 until the collection is fully assembled and held; then 0→1 as the whole group is pulled into the Ember. */
  wrapProgress: number;
  /** A single reaction timed to the wrap's climax — not per-invoice. */
  emberPulse: number;
  /** Small additive bump on top of the base trust curve, timed to the wrap. */
  trustBump: number;
};

// Six different invoices, six different customers, five different AR
// channels — every one of them money owed TO the company. Half show
// an outstanding balance, half show a due date, so the collection
// reads as varied real records, not one template repeated six times.
const INVOICES: InvoiceDef[] = [
  { id: "inv-4491", kind: "email", invoiceNo: "INV-4491", customer: "Acme Corp", amount: "$82,400.00", tag: "Outstanding" },
  { id: "inv-4483", kind: "erp", invoiceNo: "INV-4483", customer: "Meridian Foods", amount: "$41,900.00", tag: "Due Sep 18" },
  { id: "inv-10482", kind: "pdf", invoiceNo: "INV-10482", customer: "Halden Industries", amount: "$18,400.00", tag: "Outstanding" },
  { id: "inv-2207", kind: "whatsapp", invoiceNo: "INV-2207", customer: "Bellweather Textiles", amount: "$54,000.00", tag: "Due Sep 22" },
  { id: "inv-3390", kind: "upload", invoiceNo: "INV-3390", customer: "Northfield Distributors", amount: "$29,750.00", tag: "Outstanding" },
  { id: "inv-4510", kind: "email", invoiceNo: "INV-4510", customer: "Ridgeline Retail", amount: "$6,250.00", tag: "Due Sep 25" },
];

// Windows generated, not hand-typed. Six invoices arrive with a slight
// overlap (a stream, not a metronome), finish by ~0.74, then the
// collection holds untouched until 0.84, then wraps into the Ember by 1.0.
const TIMELINE_START = 0.02;
const ARRIVALS_END = 0.74;
const WINDOW_WIDTH = 0.16;
const STEP =
  INVOICES.length > 1
    ? (ARRIVALS_END - WINDOW_WIDTH - TIMELINE_START) / (INVOICES.length - 1)
    : 0;

const WRAP_START = 0.84;
const WRAP_END = 1.0;

function invoiceWindow(i: number): readonly [number, number] {
  const start = TIMELINE_START + i * STEP;
  return [start, start + WINDOW_WIDTH];
}

// Fractions *within* an invoice's own window — correct regardless of
// how many invoices there are or how wide/narrow each window ends up
// being. Travel finishes exactly at the window's end, so an invoice is
// always fully locked by the time its own window closes.
const APPEAR_SPAN = 0.25;
const TRAVEL_START = 0.15;
const TRAVEL_END = 1.0;
// Centered so the bell returns to exactly 0 by s = 1.0 (fully locked) —
// otherwise a lingering flash would bleed into the hold beat, which
// should read as calm and settled, not still flickering.
const LOCK_FLASH_CENTER = 0.92;
const LOCK_FLASH_WIDTH = 0.08;

function remap(f: number, [a, b]: readonly [number, number]) {
  return b > a ? clamp01((f - a) / (b - a)) : 0;
}

export function panel1StateForChapterLocal(
  chapterLocal: number,
  reducedMotion: boolean
): Panel1State {
  const invoices: InvoiceRenderState[] = INVOICES.map((def, i) => {
    const s = remap(chapterLocal, invoiceWindow(i));

    const arrivalOpacity = clamp01(s / APPEAR_SPAN);
    const rawArrivalT = remap(s, [TRAVEL_START, TRAVEL_END]);
    // Under reduced motion each invoice simply appears at its locked
    // slot rather than traveling there — no cross-panel movement —
    // while still respecting the same arrival timing as the others.
    const arrivalT = reducedMotion ? (arrivalOpacity > 0 ? 1 : 0) : rawArrivalT;
    const lockFlash = Math.max(
      0,
      1 - Math.abs(s - LOCK_FLASH_CENTER) / LOCK_FLASH_WIDTH
    );

    return { ...def, arrivalOpacity, arrivalT, lockFlash };
  });

  const rawWrap = remap(chapterLocal, [WRAP_START, WRAP_END]);
  // The wrap-into-Ember is one deliberate, held event, not a scroll-
  // scrubbed continuous move — under reduced motion it snaps once the
  // collection has been assembled and held for a beat, rather than
  // playing out as the group visibly contracting across the panel.
  const wrapProgress = reducedMotion ? (rawWrap > 0.5 ? 1 : 0) : rawWrap;

  // Peaks mid-wrap, as the collection visually reaches the Ember, and
  // returns to exactly 0 by wrapProgress = 1 — a sustained reaction
  // that fully settles, not a glow that lingers into Panel 2.
  const emberPulse =
    wrapProgress <= 0 ? 0 : Math.max(0, 1 - Math.abs(wrapProgress - 0.72) / 0.28);

  return {
    invoices,
    wrapProgress,
    emberPulse,
    trustBump: emberPulse * 0.12,
  };
}
