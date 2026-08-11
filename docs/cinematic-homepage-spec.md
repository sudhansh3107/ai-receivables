# Cinematic Homepage: Design Specification

**AI Receivables — Employee #001 — Public Homepage**

A pre-implementation spec for a scroll-driven, cinematic public homepage in which a persistent 3D presence — Employee #001 — is born, learns, decides, acts, and earns trust, before the camera pulls back to reveal the Digital Workforce thesis. Nothing here is built yet.

- **Status**: Specification only — no implementation
- **Scope**: New public route, isolated from the existing app
- **Prepared**: 2026-08-11

## Contents

01. Visual language
02. Employee #001
03. Scroll timeline
04. Choreography system
05. Where to animate
06. Desktop ↔ mobile
07. Performance
08. Technical architecture
09. First prototype
10. What to avoid
— Open questions

---

> **Narrative honesty constraint**
>
> The film dramatizes the company's **thesis**, not the current build. The six-rung trust ladder (Observe → Recommend → Draft → Execute with Approval → Execute Within Policy → Own) and the closing multi-employee reveal are **narrative devices** representing where Digital Employment is going — not claims about what ships today. The only thing the film should assert as real and present-tense is what's actually true: an Accounts Receivable employee exists, and it processes invoices. Everything past that — autonomy levels, the workforce of siblings — must read visually as **vision**, not product. This governs every beat below and directly extends the rule already in `CLAUDE.md` against implying unbuilt Founder Memo concepts are live.

---

## 01 · Visual language

The existing product already made one good call worth preserving: its single accent — the warm gold "employee indicator" pulse in `globals.css` (`#D9AE67 → #B88945`) — sits on a near-black/white neutral field with no purple anywhere. The homepage should feel like the cinematic, wide-screen version of that same restraint, not a different company. It should **not** reuse Apple's palette, type, or chrome, and it should actively steer away from the AI-marketing default look (purple-to-blue gradients, glowing neural-network spheres, glassmorphic cards floating in space).

### Mood

Premium · Calm · Trustworthy · Operational · Intelligent · Restrained · Enterprise-grade · Patient · Quiet confidence

### Palette

Two moves carry the whole system: an ink ground with a warm bias instead of a clinical black, and a color-temperature arc — cool, analytical slate early in the film warming into the existing brass/gold as trust is earned. The gold is never just decoration; it is the visual signal for "this has been proven."

| Swatch | Name | Hex |
| --- | --- | --- |
| ⬛ | Ink ground | `#100E0B` |
| 🟦 | Slate (pre-trust) | `#4E5A66` |
| 🟨 | Brass (earned trust) | `#D9AE67` — existing app accent |
| 🟧 | Brass, deep | `#B88945` — existing app accent |
| ⬜ | Ledger paper | `#F1EBDD` |
| ⬛ | Void (cold open) | `#3A4048` |

### Type

Two roles, deliberately not the safe default (no Inter, no Space Grotesk as the voice of the page). A document-weight serif for the rare display moments — cold open, the final reveal line — paired with a plain, humanist system sans for the low-key subtitle captions that run under the 3D scene, and a monospace for anything that reads as data (day-counts, invoice figures, scroll-synced labels), because this is a finance product and figures should look counted, not typeset.

- **Display — Iowan Old Style / Georgia stack**: "Employee #001"
- **Caption — system sans**: "It learns how this business actually operates."
- **Data — monospace, tabular**: `Customer — 47 days overdue`

Large display type gets tight, slightly negative tracking (~-0.01 to -0.02em) per the same optical-sizing logic Apple uses internally; captions stay near 0 tracking. No headline runs longer than about twelve words — this is subtitle pacing, not landing-page copy.

### Material & light, as a philosophy

Everything Employee #001 is made of should look *instrumented* rather than organic or robotic — brushed metal, cut glass, etched line-work, the vocabulary of a precision object (a seal, a ledger, an instrument) rather than a face or a body. Light does narrative work: fog density stands in for uncertainty and clears as context builds; color temperature stands in for trust, moving from cool slate to warm brass over the course of the film. Nothing is a literal robot, hologram, or chat bubble.

---

## 02 · Employee #001 — five directions

Per the brief, the object identity is intentionally left open. Five directions below, kept distinct so a real choice can be made — followed by a recommended starting point, not a final decision.

### A — The Ledger Constellation *(abstract / node-based)*

No object at all in the traditional sense — Employee #001 is a coalescing point of light that organizes scattered data-motes (invoices, emails, records) into a structured lattice around a stable core. Fully non-humanoid. Trust progression reads as the lattice's structural rigidity: loose and drifting early, locked and symmetrical late.

**Risk**: closest to the "glowing neural network" AI cliché if over-rendered — needs restraint, sparse node count, no dense sphere.

### B — The Instrument *(mechanical / governed)*

A precise, immaterial-feeling object built from thin brushed-metal and glass rings — closer to an astrolabe or a notary's seal than to a robot. It evokes accountability and governance directly: an instrument of trust, not a character. Trust progression is literal mechanism — rings that drift out of alignment early, then lock into a single true axis by the end.

**Fit**: strongest match for "operational, restrained, enterprise-grade."

### C — The Ember *(minimal / single core)*

One warm, breathing point of light — a direct scale-up of the existing `.employee-indicator` pulse already in the product. Brightens, steadies, and stabilizes across the sequence. The most minimal and least risky direction technically; also the most continuous with the product that already exists.

**Risk**: may read as too small a gesture to carry a full cinematic film on its own.

### D — The Ledger Block *(tactile / sculptural)*

A solid, glass-like volume etched with fine ledger lines, filling with light as invoices flow through it — a physical, almost architectural object grounded in the paper-ledger-to-digital metaphor. Tangible and finance-native rather than sci-fi.

**Risk**: can feel static/object-like rather than "alive" without careful animation of the internal etching.

### E — The Threshold *(spatial / avant-garde)*

Not an object at all — a spatial aperture that data passes through and reforms on the other side. The camera itself moves through it at key beats. The most original direction and the hardest to execute predictably across camera angles and mobile framings.

**Risk**: highest technical and narrative risk; hardest to keep legible on mobile.

### Recommended starting point — Instrument, lit by an Ember *(B + C)*

Use B's rings as the visible structure of trust (literally: the Trust Architecture made physical) with C's warm core as the light source inside them — the thing that's "alive" is the light, the thing that "earns trust" is the mechanism around it. This directly extends the existing gold indicator into the hero identity, gives the trust ladder a mechanism to visualize rather than just a caption, and avoids both the node-sphere cliché (A) and the higher execution risk of E. Keep D and A in reserve as alternate textures for individual beats (e.g., ledger etching as a material detail on the instrument's core, in beat 8).

---

## 03 · Cinematic scroll timeline

Eleven continuous movements (a cold open plus the ten story beats from the brief), each a scroll-percentage range against one master progress value `t ∈ [0,1]` — never separate "sections," always one continuous interpolation. Border color shifts from slate to brass across the strip, visually encoding the same trust arc the copy describes.

**Overview strip:**

| Range | Beat |
| --- | --- |
| 0–4% | Cold open |
| 4–15% | Employee #001 appears |
| 15–27% | Information enters |
| 27–39% | Context develops |
| 39–49% | Evaluates a situation |
| 49–57% | Makes a decision |
| 57–65% | Executes an action |
| 65–73% | Outcome changes |
| 73–81% | Employee learns |
| 81–90% | Trust increases |
| 90–100% | Workforce reveal |

### 0 · Cold open — 0–4% (prelude)

- **Camera**: Static, held. No movement at all — the first thing the visitor learns is that this page is patient.
- **Object & light**: Pure void. A single distant point of light, not yet resolved into a form.
- **On screen**: Nothing. No wordmark, no headline, no chrome. Silence is the point.

### 1 · Employee #001 appears — 4–15% (Trust: Observe)

- **Camera**: Slow dolly-in from far off-axis, settling center-frame.
- **Object & light**: The instrument assembles from stillness into a defined silhouette; key + rim light introduce its edges.
- **On screen**: Small, low on frame, tracked caps.
- **Copy**: "Employee #001." — "Accounts Receivable."

### 2 · Information enters the system — 15–27% (Trust: Observe)

- **Camera**: Gentle orbit, tracking incoming data-motes drifting in from the periphery.
- **Object & light**: Fine ledger etching lights up on the surface as each mote lands. Cool, analytical slate key light.
- **On screen**: Words tied to individual motes as they land, not a paragraph.
- **Copy**: "Invoices." — "Emails." — "Payment history."

### 3 · Context develops — 27–39% (Trust: Observe → Recommend)

- **Camera**: Pulls back slightly to reveal the connective lattice forming between motes.
- **Object & light**: Threads connect data-nodes to customer-nodes; fog thins fractionally; light warms a degree.
- **On screen**: Two-line caption, steadier weight than beat 2.
- **Copy**: "It learns how this business actually operates. Not how an average business operates."

### 4 · Evaluates a situation — 39–49% (Trust: Recommend)

- **Camera**: Push-in with rack-focus, isolating one thread; everything else falls to near-black.
- **Object & light**: One connection sharpens under a tight spotlight key.
- **On screen**: Monospace, data-report register — this is evidence, not a mood line.
- **Copy**: "Customer — 47 days overdue. History: always late. Never defaults."

### 5 · Makes a decision — 49–57% (Trust: Draft)

- **Camera**: Holds. The one deliberate stillness in the entire film — motion stops to sell the weight of the moment.
- **Object & light**: A ring locks into place; a single pulse travels the structure; brief high-contrast flash-to-still.
- **On screen**: Short, confident, specific about the boundary it's choosing.
- **Copy**: "Send a reminder. Not an escalation."

### 6 · Executes an authorized action — 57–65% (Trust: Execute with Approval)

- **Camera**: Fast follow along an outbound beam of light — the only quick camera move in the film, deliberately contrasting beat 5's stillness.
- **Object & light**: A beam launches from the core outward; directional streak with subtle motion blur.
- **On screen**: A small, unglamorous governance mark — human oversight made visible, not narrated.
- **Copy**: "Reviewed. Sent."

### 7 · The business outcome changes — 65–73% (Trust: Execute with Approval → Within Policy)

- **Camera**: Pulls back, widening to frame a resolving metric-line near the core.
- **Object & light**: A ledger-line visibly settles; light brightens and warms further.
- **On screen**: Outcome stated in business terms, not task terms — echoes the Founder Memo's "judged by outcomes, not activity."
- **Copy**: "Cash collected. Relationship intact."

### 8 · The employee learns — 73–81% (Trust: Execute Within Policy)

- **Camera**: Slow orbit mirroring beat 2's motion, reversed — a visual rhyme signaling the loop closing.
- **Object & light**: The outcome returns inward as a mote; the core gains one permanent new etched line — visible, cumulative growth.
- **On screen**: Plain statement of the mechanism, not a metaphor.
- **Copy**: "Every outcome updates what it knows."

### 9 · Trust / autonomy increases — 81–90% (Trust: → Own)

- **Camera**: Stabilizes into a symmetrical, centered framing — compositional resolution standing in for earned trust.
- **Object & light**: The lattice tightens into its most ordered formation; fullest warmth of the film.
- **On screen**: The five prior rungs surface dimmed, in sequence, then fade; the last lands largest and brightest.
- **Copy**: Observe → Recommend → Draft → Execute with Approval → Execute Within Policy → **Own**

### 10 · The camera reveals the Digital Workforce — 90–100% (thesis)

- **Camera**: The one big pull-back of the film — fast, dramatic retreat to a wide establishing shot. Used exactly once.
- **Object & light**: Employee #001 is revealed as one of several forms in the dark field. The others are dim, schematic silhouettes — unrealized roles, not rendered products — keeping the claim honest.
- **On screen**: Thesis line, then the first and only UI chrome in the film: one primary CTA.
- **Copy**: "AI Receivables is Employee #001. Digital Employment is the workforce every business is about to hire."

### Coda · Handoff to the site — 100%+

- **Camera**: None — the canvas ends.
- **Transition**: Canvas crossfades out over ~400ms — the one ordinary-speed UI transition in the whole experience.
- **On screen**: A normal, lightweight DOM section takes over: nav, product CTA, footer. The film has a runtime; it does not trap the scroll forever.

---

## 04 · Choreography system

The rules that keep camera, object, light, and type from drifting out of sync — everything above is driven off one shared value.

### Camera

- One normalized progress value `t ∈ [0,1]` for the whole film, smoothed with a damped follow (spring or lerp toward the raw scroll-derived target) so camera motion itself feels physical, not stepped — even though the top-level trigger is scroll, not a gesture.
- A single camera path defined as a spline through named stations, one per beat above; position, look-at, and FOV all interpolate continuously between stations. No hard cuts except the two explicitly called out: the cold-open's first light, and beat 10's pull-back.
- Beat 5's held stillness and beat 6's fast follow only read as deliberate because everything around them is slow and continuous — protect that contrast; don't let any other beat compete for "fast."

### Lighting

- Three-point rig tied to `t`: key light color temperature runs cool slate → warm brass across the film (see palette); ambient fog/occlusion density decreases as context builds, standing in for uncertainty clearing.
- Rim light strength spikes specifically at "clarity" beats (4, 5) and softens at "diffuse" beats (2, 3) — light legibly marks which kind of moment the viewer is in.

### Typography

- One fixed-position lower-third text layer, not per-section DOM blocks — captions cross-dissolve in place rather than sliding in as "new sections."
- Display-weight type reserved for exactly two moments: the cold open's identity line and beat 10's thesis line. Everything between is subtitle-scale.
- Twelve words maximum per caption. If it needs more, it's two captions in sequence, not one longer one.

### Transitions

- No slide/fade "sections." Every beat-to-beat move is continuous scene interpolation on the shared timeline.
- Exactly two permitted hard transitions: void→first-light at the cold open, and canvas→DOM at the coda handoff.

---

## 05 · Where animation should — and shouldn't — be used

### Use it

- The whole 3D sequence itself — camera, object state, lighting, all scroll-scrubbed as above.
- Caption cross-dissolves, opacity + small transform only, GPU-cheap.
- A single subtle mouse-parallax layer on desktop only, spring-damped, decorative — the kind of "conversation with the object" apple-design describes, never functional.
- The one 400ms crossfade at the canvas→DOM handoff, and ordinary ≤250ms fades inside the post-film DOM section (nav, CTA, footer) — matching the rest of the product's motion language, not the cinematic one.

### Don't

- No scroll-progress bar, dots, or percentage readout — explicitly excluded by the brief, and it would break the "no visible scroll UI" requirement outright.
- No hover-driven decorative motion during the film — there's nothing to hover; the only input is scroll (and, on desktop, the optional mouse-parallax above).
- No typewriter or per-character text effects on captions — cross-dissolve only. Typewriter reads as filler motion, not narration.
- No idle ambient loop slow enough to feel like a stock AI demo reel (avoid anything near a 0.2Hz oscillation — one cycle per five seconds reads as "generic hero background," not "cinematic").
- No animation on the post-film footer/nav beyond the product's existing restrained motion vocabulary — once the film ends, the page should visibly relax into "you've landed," not keep performing.

---

## 06 · Desktop ↔ mobile

Same eleven beats, same copy, same trust arc — different composition, density, and total scroll length.

| Dimension | Desktop | Mobile |
| --- | --- | --- |
| Framing | Wide, horizontal camera travel, generous negative space | Tighter, portrait-oriented framings; less lateral movement |
| Scroll length | Full length (100% baseline) | ~60% of desktop's scroll distance — same beats, compressed pacing, not a shortened story |
| Particle / mote count | Full density | Reduced count, larger individual motes for legibility at small size |
| Model detail | Full-resolution mesh, real-time multi-light rig | Decimated / LOD mesh, mostly baked lighting |
| Post-processing | Bloom, DOF, film grain as budget allows | Reduced or disabled; reserve for the tier check in §7 |
| Pointer interaction | Subtle spring-damped parallax on mouse move | None — no pointer to react to |
| Target frame rate | 60fps | 30fps floor, adaptive quality below that |

---

## 07 · Performance architecture

### Adaptive quality tiers

| Tier | Trigger | Renders as |
| --- | --- | --- |
| Cinematic | High-end GPU heuristic, sustained 60fps | Full post-processing, dynamic multi-light rig, real geometry |
| Standard | Mid-tier device or sustained <45fps desktop / <24fps mobile | Baked lighting, simplified post-processing |
| Lite | Low-end device, or `prefers-reduced-motion` | Pre-rendered loop or static hero frame + CSS-only caption fades, no WebGL |
| Static fallback | No WebGL available | Fully static page: hero image + normal linear scroll of image/text sections telling the same ten beats, no camera |

### Budgets & loading

- Single glTF model, Draco/meshopt-compressed, target under 2–3MB; shared material atlas; no environment HDRIs — lighting is procedural/gradient-based, both for file size and because it composites more predictably against the color-temperature arc above.
- First paint is DOM only (wordmark, nothing else) so the 3D canvas never blocks LCP; the canvas mounts after, and the cold-open beat's "coalescing from void" doubles as the loading state — a real narrative beat, not a spinner bolted on.
- Scroll → progress mapping and camera/light updates run via `requestAnimationFrame` against refs/uniforms directly, not React state, so scroll never triggers a React re-render.
- Render loop pauses via `IntersectionObserver`/Page Visibility when the canvas is off-screen or the tab is hidden.
- `prefers-reduced-motion` forces the Lite tier regardless of measured device capability — reduced motion means a gentler equivalent, not a broken one.

---

## 08 · Technical architecture

- **React Three Fiber + drei** for the 3D layer; **GSAP ScrollTrigger** (or a Lenis-normalized custom rAF driver) collapses scroll into the single `t` value that drives camera, object, and lighting — one source of truth so nothing can drift out of sync.
- Smooth-scroll normalization (Lenis or equivalent) evens out delta across trackpad/wheel/touch *without* disabling native scrollbar, keyboard, or assistive-tech scroll semantics — the brief wants a cinematic *feel*, not literal scroll-jacking.
- The caption layer is plain DOM/React, positioned via CSS and driven off the same `t` through a small lookup — never physically tied to a scroll "section," so it can only ever cross-dissolve, never slide.
- The entire experience lives behind `next/dynamic` with `ssr:false`, so the static fallback in §7 is real HTML with no JS dependency, and the existing dashboard's server bundle is untouched.
- No shared state or imports with the existing app — a clean seam, per the standing instruction not to modify the current application.
- CI perf gates: Lighthouse/WebPageTest budgets on LCP, TBT, and JS bytes; a dev-only FPS HUD for manual QA on real devices.

---

## 09 · First prototype

Prove the riskiest bet first — the scroll → camera/light/object sync pipeline — rather than building all eleven beats.

### In scope

- The recommended Instrument + Ember object (§02), at Standard-tier fidelity.
- Three representative beats spanning the full range of camera behavior: **1** (slow convergence), **4** (push-in / rack-focus isolation), and **10** (the one dramatic pull-back) — deliberately the three that stress-test different camera techniques.
- The full tier system from day one, including the static/no-WebGL fallback and `prefers-reduced-motion` path — never bolted on after the fact.
- Real testing on one actual mid-tier mobile device, not just desktop DevTools throttling.

### Explicitly deferred

- Final material/lighting polish, and the remaining eight beats' full choreography.
- Any audio/haptic layer.
- CMS or content-editing wiring for the captions.

---

## 10 · What to explicitly avoid

- Purple-to-blue gradient heroes, glowing "neural network" node-spheres, or glassmorphic cards floating in 3D space — the most overused AI-marketing visuals, and the ones this spec's Direction A specifically has to stay well clear of.
- A hero that's really just "an abstract blob rotating slowly forever" — the object must change state meaningfully at every beat, not loop decoratively.
- Emoji, stock "robot hand touching human hand" imagery, crypto-style wireframe globes, or lorem-ipsum-feeling copy — every caption above is a specific, concrete sentence with a real number or a real term (47 days, DSO), never a placeholder mood line.
- Any visible scroll-progress indicator — bar, dots, or percentage. Explicitly banned by the brief.
- Autoplay audio. If a score is added later it must be optional and off by default — silence is more premium than an unearned soundtrack.
- Letting the beat-10 reveal overclaim: the sibling Digital Employees must stay schematic/unlit, never fully rendered as if shipped — see the honesty constraint at the top of this document.

---

## Open questions before implementation

1. **Routing conflict.** The app's only live route today is `/`, serving the Mission Control dashboard. A public homepage needs either (a) the dashboard moves behind a different path and this film takes over `/`, or (b) the film lives at a separate path/subdomain and `/` stays the app. This is a real product decision, not a design one — needs your call before any routing work starts.
2. Should the post-film DOM section (nav/CTA/footer) adopt the cinematic palette, or hand off to the existing app's current light/dark tokens for continuity with the product itself?
3. Is a musical score in scope at all, even as an opt-in? Affects whether the multimodal-feedback rules from apple-design (causality/harmony/utility) need to be spec'd now or later.
4. Who owns the final beat-by-beat copy pass — this spec's captions are directionally right but not final marketing copy.
5. Browser/device support floor (e.g., is iOS Safari's older WebGL behavior a hard constraint?) — determines how conservative the Standard tier needs to be.

---

*Design specification only. No 3D, animation, or routing code has been written. Next step, pending direction on §02 and the routing question in the appendix, is the first prototype scoped in §09.*
