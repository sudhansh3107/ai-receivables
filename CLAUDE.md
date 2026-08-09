@AGENTS.md

# AI Receivables — Project Instructions

## Product Identity

AI Receivables is **Employee #001** — the Accounts Receivable Digital Employee — the first Digital Employee within the broader **Digital Employment** platform described in `docs/FOUNDER_MEMO.md`.

The current codebase is an **AR task-processing engine**: it uploads invoices, extracts data with AI, creates customers/invoices, logs activity, and schedules reminders. It is a step **toward** a true Digital Employee, not yet one. It does not currently implement autonomy levels, trust scoring, a lifecycle model, or Organizational Intelligence layers.

Do not describe or imply that Founder Memo concepts (Trust Architecture levels, Digital Employee lifecycle stages, Organizational Intelligence layers, multi-employee workforce) are implemented unless they actually exist in code. When in doubt, check the codebase first.

## Product Philosophy

Development should be informed by these principles (full detail in `docs/FOUNDER_MEMO.md`):

- **Responsibility** — the employee owns an outcome (cash collected), not a task count (emails sent).
- **Context** — behavior should reflect *this* organization's policies and history, not generic defaults.
- **Trust** — authority is earned progressively; never assume more autonomy than has been granted.
- **Growth** — the system should improve from corrections and outcomes over time; not a one-time build.
- **Organizational Intelligence** — decisions should draw on business, operational, relationship, decision, performance, and learning context specific to the org.
- **Outcome ownership** — success is measured by business metrics (DSO, cash recovered), not feature usage.

See `docs/FOUNDER_MEMO.md` for the complete philosophy — do not reproduce it here.

## Trust Architecture

Core principles that should guide any work touching automation, approvals, or AI-driven actions:

- **Progressive Autonomy** — trust is earned in stages (observe → draft → supervised execution → autonomous), never assumed by default.
- **Policy Before Intelligence** — organizational policy boundaries always take precedence over what a model judges optimal.
- **Evidence Before Action** — recommendations and actions should be traceable to specific supporting data, not just a score.
- **Human Governance** — every consequential action must remain visible, reviewable, and reversible by a human.

**Current state:** the full Trust Architecture is **not implemented**. The closest existing analog is `invoices.invoice_confidence_score` / `invoice_confidence_level` / `invoice_confidence_reasons`, which is a single extraction-quality signal, not a multi-dimensional trust/authority system. Do not build UI or logic that presents automated actions as "approved" or "trusted" beyond what this single score actually supports.

## Current Technical Stack

As installed in `package.json`:

- **Next.js 16.2.11** (App Router) — pre-release/breaking-change version; see `AGENTS.md` before relying on any Next.js API behavior.
- **React 19.2.4** / **react-dom 19.2.4**
- **TypeScript ^5**
- **Tailwind CSS ^4** (`@tailwindcss/postcss`, `tailwindcss-animate`)
- **@supabase/supabase-js ^2.110.8** — Postgres, Storage, Realtime
- **openai ^6.49.0** — invoice extraction (`gpt-5.5`, structured JSON output)
- **googleapis ^174.0.1** — Gmail OAuth + message retrieval
- **react-dropzone ^19.1.1** — file upload UI
- **sonner ^2.0.7** — toasts
- **motion ^12.43.0**, **date-fns ^4.4.0**, **clsx**, **tailwind-merge**
- Dev/tooling: **eslint 9**, **tsx**, **@faker-js/faker** + **dotenv** (demo data generator/seeder)

## Current Architecture

- **Next.js App Router**, React 19, TypeScript, Tailwind 4.
- Two Supabase clients: `lib/supabase.ts` (anon/publishable key, used client-side) and `lib/supabaseAdmin.ts` (service-role key, server-only — e.g. signed URLs for extraction).
- **Invoice processing pipeline**: `app/components/invoice/UploadInvoice.tsx` (client) → `services/storageService.ts` (Storage upload) → `services/invoiceFileService.ts` (DB row) → `app/actions/processInvoiceAction.ts` (server action) → `services/processingengine.ts`, which orchestrates extraction, validation, customer matching, confidence scoring, invoice creation, customer-insight refresh, activity logging, and reminder scheduling.
- **AI extraction**: `services/server/invoiceExtractionService.ts` — signed Storage URL sent to OpenAI structured-output API.
- **Realtime dashboard**: `app/hooks/useDashboard.ts` subscribes to Supabase Realtime (`postgres_changes`) across `payments`, `invoices`, `customers`, `activity_log`, `employee_activity`, `invoice_files`, `upload_sessions`, `reminders` and debounce-refreshes `services/server/dashboardService.ts` data.
- **Gmail ingestion** (`app/api/auth/gmail/*`, `app/api/gmail/messages/*`, `lib/gmail/parse-email.ts`): OAuth + message fetch/normalize, functional but **not wired** into the invoice processing pipeline.
- **Route structure**: only two routes exist — `/` (root dashboard, using `app/components/headquarters/*`) and `/playground` (a separate demo layout using `app/components/dashboard/*`). The sidebar nav (`app/components/sidebar/navItems.tsx`) links to 6 additional routes (`/dashboard`, `/employees`, `/invoices`, `/customers`, `/payments`, `/approvals`, `/insights`, `/settings`) that do not exist yet.

## Current MVP Capabilities

Actually implemented and working today:

- PDF invoice upload (drag/drop, `react-dropzone`) to Supabase Storage.
- AI-based invoice field extraction via OpenAI structured output.
- Customer find-or-create, duplicate-invoice detection, and a single-dimension confidence score per invoice.
- Invoice creation, file-to-invoice linking, and first-stage reminder scheduling (DB row created; no send mechanism verified in code).
- Customer insight recalculation (payment behavior stats — risk level, delay averages, on-time rate, etc.) after each processed invoice.
- Two activity trails: `activity_log` (business events) and `employee_activity` (granular live progress feed shown in the upload modal).
- Live dashboard metrics driven by Supabase Realtime subscriptions.
- Payment recording via `POST /api/payments`.
- Gmail OAuth connect + message listing + full MIME email parsing/normalization (standalone, not yet feeding invoices).
- Demo data generator and Supabase seeder (`demo-data/`) for local development.

## Known Gaps

- **No application authentication.** No Supabase Auth, no session/login, no middleware — anon key has direct client-side table/storage access.
- **No multi-tenancy / organization boundary.** All data is effectively single-tenant; no `organization_id` or equivalent scoping exists in the schema.
- **No RLS/security review performed.** Row-level security posture on Supabase tables/buckets is unverified.
- **Manual invoice entry is a stub.** `ManualInvoice.tsx` renders only `"Form coming next..."`.
- **Missing navigation routes.** 6 of 8 sidebar links 404 (no corresponding `app/` route folders).
- **Gmail → invoice pipeline is disconnected.** Email parsing exists but does not feed `processingengine.ts`.
- **Hardcoded review/approval UI values.** The upload-complete screen shows "Approved Automatically" / "Needs Your Review: 0" as static values, not derived from `invoice_confidence_level` or any real review state.
- **Trust Architecture is not implemented.** No policy table, no approval/escalation workflow, no multi-dimensional confidence, no autonomy levels.
- **No Digital Employee lifecycle model.** No onboarding/probation/performance-review/trust-level state anywhere in the schema or code.
- **Orphaned/duplicate dashboard components.** `app/components/headquarters/{Headquarters,KPIGrid,StatCard,MetricsPanel,HeroContent,DecisionItem,DecisionQueue,ExecutiveBriefing}.tsx` are never imported. The `headquarters/*` (used on `/`) and `dashboard/*` (used on `/playground`) component sets duplicate similar UI concepts without being unified.

## Data Model Rules

`docs/DATABASE_SCHEMA.md` is the authoritative reference for the documented database model. Never invent tables, columns, relationships, enums, or constraints — if something isn't in that file or visible in code, treat it as not existing.

Before making any schema change:

1. Inspect the existing schema and the code that reads/writes it.
2. Explain the proposed migration in plain terms.
3. Identify all affected functionality (queries, services, UI).
4. Get explicit approval from the user.
5. Only then implement.

## Engineering Rules

- Preserve existing functionality unless explicitly asked to change it.
- Prefer minimal, targeted changes over broad rewrites.
- Do not rewrite architecture unnecessarily.
- Do not expose service-role credentials (`SUPABASE_SERVICE_ROLE_KEY`, etc.) to client code.
- Inspect the installed Next.js version and docs before relying on version-specific behavior — this repo runs a breaking-change pre-release (see `AGENTS.md`).
- Never represent mock, hardcoded, planned, or incomplete functionality as production functionality — to the user or in the UI.
- Do not fix unrelated issues unless explicitly requested.
- When uncertain, inspect the code rather than guessing.

## UX / UI Principles

The product should feel: premium, calm, trustworthy, operational, intelligent, restrained, enterprise-grade.

Prioritize:

- Information hierarchy
- Financial clarity
- Action clarity
- Evidence / explainability
- Human governance (who can review/override is always visible)
- Accessibility
- Responsiveness
- Performance
- Meaningful interaction states (loading, empty, error, success)

Avoid:

- Generic AI aesthetics
- Excessive gradients
- Purple AI clichés
- Excessive glassmorphism
- Excessive card grids
- Decorative UI without purpose
- Unnecessary animation
- Visual clutter

Do not directly copy Apple's UI. Apple Human Interface Guidelines may be used as a design-principles reference only.

## Development Workflow

For meaningful changes:

1. Inspect the existing implementation.
2. Explain the proposed approach.
3. Make the smallest appropriate change.
4. Test affected functionality.
5. Report exactly what changed and any remaining risks.

For large architectural or schema changes, stop and ask for approval before implementation.

## Source-of-Truth Files

- `docs/FOUNDER_MEMO.md` — product vision, terminology, and philosophy.
- `docs/DATABASE_SCHEMA.md` — documented database model.
- Repository code — actual current implementation.
