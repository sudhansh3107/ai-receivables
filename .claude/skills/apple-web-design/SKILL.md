---
name: apple-web-design
description: Translates Apple Human Interface Guidelines and Apple's "Principles of great design" (Purpose, Agency, Responsibility, Familiarity, Flexibility, Simplicity, Craft, Delight) into web/SaaS design rules for the AI Receivables B2B finance app (Next.js + React + Tailwind). Use before designing, redesigning, or reviewing any UI in this repo.
---

# Apple-Informed Web Design for AI Receivables

## What this is

This skill translates Apple HIG and Apple's "Principles of great design" into
concrete rules for a **Next.js + React + Tailwind B2B finance web app**. It is
a set of design *principles*, not a visual template.

**Do not:**
- Copy Apple's visual style or native platform chrome.
- Reproduce Apple-specific components or patterns: SwiftUI, UIKit, SF Symbols,
  Liquid Glass, native nav/tab bars, iOS/macOS layout conventions.
- Treat this as "make it look like an Apple app." It should look like a
  premium web SaaS product, informed by Apple's design *reasoning*, not its
  aesthetics.

For product context — what's actually built, current gaps, product
philosophy — read `CLAUDE.md` and `docs/FOUNDER_MEMO.md`. This skill does not
restate them; it applies design judgment on top of what they establish as
true.

## Before touching any component

1. Inspect the current implementation — don't redesign from imagination.
2. Identify the real data source (hook/service/table) behind every number or
   claim that will appear on screen.
3. Identify existing design tokens (`lib/theme/tokens.ts`) and reusable
   primitives (`app/components/ui/*`) — extend them, don't fork new ones.
4. Preserve working behavior. Make the smallest change that fixes the actual
   problem.
5. Never invent backend functionality or schema for a visual change. If data
   doesn't exist yet, that's a state to design honestly (empty or
   future/unimplemented), not a fact to fabricate.

## The 8 Apple principles, translated for this app

| Apple principle | What it means here |
|---|---|
| **Purpose** | Every element serves a real user need. Cut decoration that doesn't aid comprehension or action. |
| **Agency** | The user stays in control. Consequential actions are explicit about what will happen, and reversible where possible. |
| **Responsibility** | Never imply AI capability, confidence, autonomy, approval, or an outcome the system doesn't actually support. |
| **Familiarity** | Use standard web/SaaS conventions (forms, tables, modals, nav). Similar controls behave identically everywhere they appear. |
| **Flexibility** | Support the real range of B2B workflows (desktop-first, keyboard-heavy, multi-invoice) without over-fitting to one screen size. |
| **Simplicity** | Remove friction, not context. A collections decision needs enough evidence to be defensible — don't strip that for cleanliness. |
| **Craft** | Typography, spacing, alignment, loading/error/empty states, keyboard interaction, and motion quality are the actual work, not polish added later. |
| **Delight** | Subtle, purposeful motion only. Never decorate to look "AI" — no gradients, glassmorphism, or animation as a substitute for personality. |

## Financial UX rules

- Numbers are scannable: right-aligned in tables/lists, consistent decimal
  places, currency symbol matched to the record's actual `currency` field
  (never assume INR or USD).
- Business-critical metrics (cash recovered, outstanding, overdue) get clear
  visual hierarchy — size and weight signal importance, not color alone.
- Never fabricate a metric, target, confidence score, or approval state. If a
  number isn't computed from real data, it must not render as if it were.
- Every value on screen must be traceable to exactly one of the five states
  below, and must look visibly distinct according to which one it is.

## The five states — always distinguish them

Every piece of dynamic UI must make it unambiguous, both visually and in
copy, which state it's in:

1. **Real data** — an actual value from a real query.
2. **Empty state** — the real query ran and returned nothing. Say so plainly
   ("No invoices need review right now"). Never render a bare `0` or blank
   space where the meaning is ambiguous.
3. **Loading state** — a fetch is in flight. Show a real loading affordance;
   never flash a `0` or a placeholder value that looks like data.
4. **Error state** — a fetch failed. Say something failed; don't silently
   fall back to an empty or fabricated value.
5. **Future/unimplemented state** — the feature doesn't exist yet. Say so
   ("not available yet" / a disabled "Soon" affordance). Never imply it's
   live.

## Digital Employee voice

- The product should read like a capable colleague doing defined work, not a
  chatbot or a generic AI feature bolted onto a dashboard.
- Employment vocabulary ("the employee is reviewing...", "assigned",
  "completed") is appropriate wherever it maps to something real actually
  happening.
- Never personify a capability the system doesn't have (negotiation,
  judgment calls, autonomy levels). Check `CLAUDE.md`'s Known Gaps before
  writing copy that implies one.

## Trust

- Trust comes from evidence and consistent behavior — never from a badge,
  icon, or score with nothing behind it.
- Do not render any trust, autonomy, or confidence indicator unless it is
  backed by real application state (e.g. a per-invoice confidence level is
  real; an employee-wide "trust level" is not, unless that system is
  actually built and queried).
- When surfacing an AI-generated observation or recommendation, show the
  evidence it's grounded in wherever that evidence is available — not just
  the conclusion.

## Accessibility & motion

- Keyboard-navigable, visible focus states, semantic HTML, `aria-label`s on
  icon-only controls.
- Sufficient contrast — check small/muted caption text specifically; that
  combination is the most common failure.
- Respect `prefers-reduced-motion`.
- Motion communicates state change, hierarchy, or feedback — never adds
  "activity" for its own sake. Keep transitions short and subtle; don't
  animate values that haven't changed.

## Responsive web design

- Optimize primarily for desktop B2B workflows — this is where invoices get
  reviewed and tables get scanned.
- Tablet and smaller screens must stay usable, but don't import mobile-first
  consumer patterns (bottom sheets, swipe gestures, oversized touch targets)
  at the cost of desktop density and efficiency.

## Visual language for AI Receivables

**Aim for:** premium, calm, operational, intelligent, restrained,
trustworthy, enterprise-grade.

**Avoid:** purple AI clichés, excessive gradients, glassmorphism, giant card
grids, decorative dashboards, fake or placeholder data visualization,
excessive rounded containers, excessive animation, badges without real
meaning behind them.
