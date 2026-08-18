# ADR-004 — Supabase for MVP Persistence and Authentication

> Mirrored from Linear. Linear remains the source of truth.

## Status

Accepted

## Context

The MVP needs relational persistence, migrations, authentication, and a
development experience that is simple enough for rapid iteration while remaining
production-capable.

## Decision

Use Supabase Postgres as the primary database and Supabase Auth for application
authentication in the MVP.

Application code should access the database through a defined persistence layer
rather than scattering direct queries throughout UI components. Schema changes
must be captured in migrations.

## Consequences

- Fast MVP setup with managed Postgres and authentication.
- Relational modeling fits leagues, rosters, players, projections, draft picks,
  and recommendations well.
- The domain layer remains portable because Supabase-specific concerns stay near
  persistence/auth boundaries.
- We avoid introducing a second authentication or database platform unless a
  concrete need emerges.
