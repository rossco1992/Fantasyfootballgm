# db/

Database access and migrations (Supabase Postgres).

Per **ADR-004 — Supabase for MVP Persistence and Authentication**:

- Application code accesses the database through a defined persistence layer
  here, rather than scattering direct queries throughout UI components.
- Schema changes are captured in **migrations** — no manual production database
  edits (see the Technical Architecture: "Use migrations for schema changes").

Suggested layout as the schema grows:

- `db/migrations/` — ordered SQL migrations (source of truth for schema)
- `db/queries/` — typed data-access helpers used by `services/`

Raw provider values retain their `source` and `timestamp`; derived/consensus
values are stored separately from raw source values (see **ADR-002**).
