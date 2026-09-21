# AI Delivery Factory

A governed, evidence-driven delivery control plane with stateless AI specialists and human authority. Built to prove the approach in the v1.4 RC4 specification: not a single long-memory chatbot, but a persistent state machine where

- **AI interprets** evidence, gaps, relevance and recommendations,
- **deterministic controls compute** gate outcomes from machine-readable state and evidence,
- **authorized humans approve**, reject, correct, waive and select target paths.

This repository is brand-neutral. The demo engagement is a fictional field-service work-order workflow.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY to enable AI specialists
npm run dev                  # http://localhost:3000
```

Without an API key the Factory runs fully: deterministic controls, human decisions, simulation, build contract and validation all work, and AI specialist jobs fail cleanly as "AI worker unavailable".

On the front door, click **Start an engagement**, or load the synthetic demo at any lifecycle stage.

```bash
npm test          # 36 acceptance tests against spec §44
npm run typecheck
npm run lint
npm run build
```

## Deploy to Vercel

Import the repository at https://vercel.com/new. Next.js is auto-detected. Set `ANTHROPIC_API_KEY` to enable specialists, and attach a Postgres store (`POSTGRES_URL`) for persistence; without Postgres the file store under `data/engagements` is used, which is fine locally but not on serverless.

## What is implemented

| Area | Where | Notes |
| --- | --- | --- |
| Factory State schema, revisioning, projection coherence | `lib/factory/schema.ts`, `state.ts`, `projection.ts` | `stateRevision` increments exactly once per governed action; a stale runtime stops transitions |
| Governed Action API (transaction) | `lib/factory/actions.ts`, `service.ts` | validate → authority → preconditions → mutate → revision → lineage → projection → next action |
| Deterministic gate engine | `lib/factory/gates.ts` | 12 gates, PASS / CONDITIONAL / BLOCKED; hard stops dominate |
| Evidence admissibility and readiness | `lib/factory/evidence.ts` | only SUFFICIENT, valid WAIVED or governed NOT_APPLICABLE satisfy; synthetic never proves real |
| Human decisions, waivers, authority | `lib/factory/decisions.ts` | decision IDs only; AI_SPECIALIST can never decide |
| Lifecycle router and one dominant next action | `lib/factory/lifecycle.ts` | 17 stages, target design modes, experience sub-lifecycle |
| Blueprint design model and design-completion gates | `lib/factory/blueprint.ts` | stable IDs, separate reviews, canonical check invariant, baseline compare, targeted invalidation |
| Integration readiness | `lib/factory/integration.ts` | four questions per integration, no skipped readiness states, separated write authority, mockability |
| Technical compiler | `lib/factory/technical.ts` | brownfield reuse preserved, observability alignment, open decisions, ARB |
| Transformation planner | `lib/factory/planner.ts` | work packages, activity-specific AI assumptions, floors, overlapped timeline, no economics |
| Build engine and contract certification | `lib/factory/build.ts` | repository-independent build units, CI unit, coding-partner protocol |
| Code validator | `lib/factory/validator.ts` | evidence hierarchy, PASS / PARTIAL / GAP / FAIL / NOT_ASSESSED |
| Simulation engine | `lib/factory/simulation.ts` | ten modes, SYNTHETIC_SIMULATION, batch checkpoints, resume, targeted invalidation |
| Specialist contracts, Context Compiler, stateless worker | `lib/factory/specialists/` | eight contracts; Claude-backed runner with structured output; results land as recommendations for human decision |
| Persistence | `lib/factory/store.ts` | file store (dev) or Postgres with optimistic concurrency and an event table |
| Experiences | `app/` | front door, workspace, workflow blueprint, evidence, decisions, experience, technical spec studio, plan, build, validate, simulation studio, lineage, command center |

## Enterprise target boundary

Persistent DB, object store, event stream and a governed action API are present in minimal form. Search or index, queue-backed worker fleets, a persistent cross-enterprise agent registry and compute-budget routing remain target architecture, as the specification states.
