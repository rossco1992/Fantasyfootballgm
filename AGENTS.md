# AGENTS.md

Guidance for coding agents (and humans) working in this repository.

## Read these first — every task

Before writing any code for a task:

1. **Read the full Linear issue** the work belongs to — its description,
   **Acceptance Criteria**, and **Definition of Done**. The Linear issue is the
   product source of truth. Do not infer scope from the branch name alone.
2. **Read the Technical Architecture** — [`docs/architecture.md`](./docs/architecture.md).
3. **Read the applicable ADRs** — [`docs/adr/`](./docs/adr):
   - [ADR-001 — Deterministic Ranking Engine](./docs/adr/ADR-001-deterministic-ranking-engine.md)
   - [ADR-002 — Canonical Player and Multi-Source Data Model](./docs/adr/ADR-002-canonical-player-and-multi-source-data-model.md)
   - [ADR-003 — Provider Adapter Boundary](./docs/adr/ADR-003-provider-adapter-boundary.md)
   - [ADR-004 — Supabase for MVP Persistence and Authentication](./docs/adr/ADR-004-supabase-for-mvp-persistence-and-authentication.md)
   - [ADR-005 — AI as Explanation Layer](./docs/adr/ADR-005-ai-as-explanation-layer.md)

   The copies in `docs/` mirror Linear; **Linear remains the source of truth**.
   If Linear and the mirror disagree, follow Linear and update the mirror.

4. **Inspect the existing repository** before proposing changes, and reuse
   existing patterns where reasonable.

## Working agreement

For each implementation task:

1. Read the Linear issue and acceptance criteria.
2. Read the architecture document and applicable ADRs (above).
3. Inspect the repository; reuse existing patterns.
4. Implement the **smallest coherent** solution that satisfies the story.
5. **Do not implement future stories** unless required to establish the
   foundation the current story needs.
6. Run the checks below.
7. Summarize files changed, checks run, decisions made, and anything needing
   product input.

## Architectural boundaries (must respect)

- **Determinism (ADR-001):** rankings and draft/waiver/lineup recommendation
  scores are computed by deterministic application code in `domain/`. An LLM may
  explain results but must never invent ranks, projections, injury status, ADP,
  or recommendation scores.
- **AI is an explanation layer (ADR-005):** AI receives only the structured data
  needed and never becomes the authoritative source of statistics.
- **Canonical data model (ADR-002):** the app owns a canonical player with a
  stable internal ID; external provider IDs are stored separately. Raw source
  values keep their `source`/`timestamp`; consensus/derived values are computed
  separately and never overwrite raw values.
- **Provider adapter boundary (ADR-003):** every external source is integrated
  through an adapter in `providers/` that normalizes payloads into internal
  contracts. Domain services and UI must not depend on provider SDKs or raw
  responses.
- **Persistence/auth boundary (ADR-004):** access Supabase through the layer in
  `lib/supabase/` and `db/`, not scattered through UI. Schema changes go in
  migrations under `db/` — no manual production database edits.
- **Layering:** keep domain logic out of UI components. `domain/` is pure (no
  I/O, no framework imports). `services/` orchestrate `domain/` + `db/` +
  `providers/`. UI depends on services, not the other way around.
- **Secrets:** server-side only; never prefix a secret with `NEXT_PUBLIC_`.
  Read config through `lib/env.ts`. Only `.env.example` is committed.

## Checks to run before finishing

```bash
npm run lint       # ESLint (Next.js + TypeScript)
npm run typecheck  # tsc --noEmit
npm run test       # Vitest unit/service tests
npm run build      # production build must succeed
# npm run test:e2e # Playwright, when a flow is affected (needs: npx playwright install chromium)
```

`npm run validate` runs lint + typecheck + test together.

## Definition of Done (baseline, per the architecture Quality Bar)

- Type checking, linting, and relevant tests pass.
- New domain logic ships with automated tests.
- Database changes include migrations.
- No secrets are committed.
- The Linear issue's acceptance criteria are satisfied.
- Unrelated refactors are avoided unless required to complete the story safely.
