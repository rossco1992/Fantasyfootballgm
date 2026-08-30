# Fantasy Football GM — Technical Architecture

> Mirrored from the Linear "Fantasy Football GM — Technical Architecture"
> document. Linear remains the source of truth; update it there first, then
> reflect changes here.

## Purpose

This document is the engineering source of truth for the personal MVP. Linear issues
define product requirements; this document defines the technical boundaries to
follow when implementing them.

## Product and Integration Boundaries

- Design for one person and one manually configured fantasy-football league
  first.
- The app owns its league, roster, keeper, and draft state. It recommends
  actions; the user executes changes on their fantasy platform.
- Support snake drafts only in the first release.
- Support one keeper per team for one additional season. A drafted keeper costs
  the same round as the prior year's draft round. Waiver/free-agent cost stays
  configurable until the league rule is confirmed.
- Use a platform-independent domain model and provider adapters.
- Accept fantasy data only through user-uploaded CSV files in the MVP.
- Do not build multi-league support, auctions, trades, write-back, public
  onboarding, billing, or commercial licensing in this MVP.

## Core Stack

- **Application:** Next.js with TypeScript
- **Styling:** Tailwind CSS
- **Database:** Supabase Postgres
- **Authentication:** Supabase Auth
- **Validation:** Zod
- **Testing:** Vitest for unit/service tests and Playwright for critical
  end-to-end flows
- **Hosting:** Vercel for the web application; Supabase for database/auth

## Architecture Principles

1. Keep the ranking and recommendation engine deterministic and testable.
2. Treat LLMs as an explanation/reasoning layer, not the source of fantasy
   statistics or rankings.
3. Normalize external fantasy data into an internal canonical data model before
   downstream use.
4. Keep fantasy-data integrations behind provider adapters so sources can be
   added or replaced without rewriting the product.
5. Preserve raw provider values and immutable snapshots; compute consensus and
   personalized outputs separately.
6. Prefer server-side access for secrets, ranking calculations, CSV parsing,
   and privileged database operations.
7. Use migrations for schema changes. Do not rely on manual production database
   edits.
8. Keep domain logic separate from UI components.
9. Make freshness, uncertainty, provenance, and degraded data visible rather
   than silently guessing.

## Data Flow

```
Manual league state + uploaded CSV files
  → CSV Adapter
  → Validation + Player Identity Matching
  → Raw Immutable Source Snapshots
  → Normalized Canonical Fantasy Data
  → Consensus Projection and Uncertainty
  → Baseline Values + League/Roster Context
  → Draft, Lineup, Waiver, and Playoff Experiences
  → Optional LLM Explanation Layer
```

## Initial Data Strategy

- Use FantasyPros and Fantasy Nerds CSV exports as the only fantasy-data input.
- Allow multiple files in one upload so separate player, ranking, ADP, and
  projection exports can be combined.
- Treat identities in the latest uploaded CSV snapshots as the draftable player
  pool.
- Maintain a canonical internal player ID.
- Store external provider IDs separately.
- Store raw value, normalized value, provider, season/week, observed-at,
  imported-at, adapter version, and provenance.
- Do not collapse source data destructively. Consensus values are separate from
  raw observations.
- Snapshot predictions before outcomes so source accuracy can be evaluated.
- Keep existing immutable provider history for compatibility, but expose no
  live provider refresh, credential, scheduled import, or backfill workflow.

## Decision-Engine Boundaries

- Recalculate projected stat lines under the configured league scoring.
- Keep a stable base market grade separate from personalized tiers.
- Dynamic tiers may react to roster construction, scarcity, availability,
  keeper context, ADP, and league/manager history.
- Show movement reasons, uncertainty, and next-pick availability rather than
  one mandatory pick.
- Weekly tools may recommend lineup choices and add/drop pairs but never claim
  an action was executed.

## Repository Conventions

- `/app` — Next.js routes/pages
- `/components` — reusable UI
- `/lib` — shared infrastructure
- `/domain` — fantasy-football domain logic
- `/services` — application services/use cases
- `/providers` — external data-provider adapters
- `/db` — database access and migrations
- `/tests` — shared test helpers/e2e assets
- `/docs/adr` — architecture decision records

The exact structure may evolve, but preserve separation between UI, domain
logic, provider integrations, and persistence.

## Quality Bar

Before a story is considered complete:

- Type checking passes
- Linting passes
- Relevant tests pass
- New domain logic has automated tests
- Database changes include migrations
- No secrets are committed
- Acceptance criteria in the Linear issue are satisfied
- Provider failure and stale-data behavior are tested where relevant
- Unrelated refactors are avoided unless required to complete the story safely

## Working Agreement

For each implementation task:

1. Read the full Linear issue and acceptance criteria.
2. Read this architecture document and applicable ADRs.
3. Inspect the existing repository before proposing changes.
4. Reuse existing patterns where reasonable.
5. Implement the smallest coherent solution that satisfies the story.
6. Run appropriate checks and tests.
7. Summarize files changed, tests run, and any remaining risks or product
   decisions.

## Current ADRs

- [ADR-001 — Deterministic Ranking Engine](./adr/ADR-001-deterministic-ranking-engine.md)
- [ADR-002 — Canonical Player and Multi-Source Data Model](./adr/ADR-002-canonical-player-and-multi-source-data-model.md)
- [ADR-003 — Provider Adapter Boundary](./adr/ADR-003-provider-adapter-boundary.md)
- [ADR-004 — Supabase for MVP Persistence and Authentication](./adr/ADR-004-supabase-for-mvp-persistence-and-authentication.md)
- [ADR-005 — AI as Explanation Layer](./adr/ADR-005-ai-as-explanation-layer.md)
