# db/

Database access and migrations (Supabase Postgres) — the persistence layer.

Per **ADR-004 — Supabase for MVP Persistence and Authentication**: application
code accesses the database through this layer rather than scattering queries
through UI components, and all schema changes are captured in migrations.

## Layout

- `client.ts` — the single place that opens a Postgres connection (a `pg` pool
  from `DATABASE_URL`), plus `query` / `withTransaction` / `closePool` helpers.
- `types.ts` — row types and Zod schemas mirroring the schema; the typed
  contract repositories return.
- `repositories/` — typed data-access functions (`players`, `providers`, …).
  **This is the only place SQL for these entities lives.** Services and UI call
  repositories, never `pg` directly.
- `migrate.ts` / `seed.ts` / `reset.ts` — migration and seed runners (see
  scripts below).
- `schema.test.ts` — verifies a fresh database can be built from the migration
  files and that the seed produces usable data, using an in-process Postgres
  (PGlite) — no Docker required.

Migrations and seed data live under [`../supabase/`](../supabase):

- `supabase/migrations/*.sql` — ordered SQL migrations (the source of truth for
  schema). The same files are understood by both the Supabase CLI and the
  `db:*` scripts here.
- `supabase/seed.sql` — idempotent development seed data.
- `supabase/config.toml` — Supabase CLI configuration.

## Commands

```bash
npm run db:migrate   # apply pending migrations to DATABASE_URL
npm run db:seed      # load supabase/seed.sql (idempotent)
npm run db:reset     # drop schema, re-migrate, re-seed (dev only)
npm run db:new NAME  # scaffold a new migration (Supabase CLI)
```

All of the above require `DATABASE_URL` (see `.env.example`). They run against
any Postgres — Supabase hosted, `supabase start`'s local database, or a plain
local Postgres.

## Data model

The initial schema implements the canonical, multi-source model from
**ADR-002**: a canonical `players` identity, provider rows in `providers`,
provider-specific IDs mapped in `player_external_ids`, and raw `player_projections`
that retain their source and `source_timestamp` and are stored non-destructively
(multiple sources/snapshots coexist; consensus values are derived separately in
a later story).
