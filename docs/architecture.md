# Fantasy Football GM — Technical Architecture

> Mirrored from the Linear "Fantasy Football GM — Technical Architecture"
> document. Linear remains the source of truth; update it there first, then
> reflect changes here.

## Purpose

This document is the engineering source of truth for the MVP. Linear issues
define product requirements; this document defines the technical boundaries to
follow when implementing them.

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
4. Keep data-provider integrations behind provider adapters so sources can be
   added or replaced without rewriting the product.
5. Prefer server-side access for secrets, provider credentials, ranking
   calculations, and privileged database operations.
6. Use migrations for schema changes. Do not rely on manual production database
   edits.
7. Keep domain logic separate from UI components.

## Data Flow

```
External Sources / CSV
  → Provider Adapters
  → Validation + Player Identity Matching
  → Normalized Fantasy Data
  → Canonical Postgres Models
  → Ranking / Recommendation Engine
  → Draft, Waiver, and Lineup Experiences
  → Optional LLM Explanation Layer
```

## Initial Data Strategy

- Start with CSV ingestion and one or two practical providers rather than
  blocking the MVP on broad API integrations.
- Maintain a canonical internal player ID.
- Store external provider IDs separately.
- Store source, timestamp, and provenance for imported values.
- Allow multiple sources to provide the same signal, such as ADP or
  projections.
- Do not collapse source data destructively; derived consensus values should be
  stored/calculated separately from raw source values.

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
