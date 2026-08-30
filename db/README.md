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
(multiple sources/snapshots coexist; consensus values are stored separately and
never overwrite them).

The canonical identity fields and deterministic matching strategy are documented
in [`docs/player-identity.md`](../docs/player-identity.md).

## Provider ingestion

Migration `0004_provider_ingestion_pipeline.sql` adds the append-only ingestion
model used by every fantasy-data adapter:

- `provider_ingestion_runs` — import attempts and counts
- `provider_data_snapshots` — immutable, fingerprinted provider deliveries
- `provider_data_records` — raw and normalized values stored side by side
- `provider_ingestion_rejections` — quarantined record-level validation errors
- `provider_ingestion_state` — last attempt/success, latest valid snapshot,
  failure count, and stale threshold

Use `db/repositories/provider-ingestion.ts`; callers should not write these
tables directly. Freshest-player queries return the newest record per provider
and record key for a player, season, week, and signal type.

Migration `0005_historical_context_and_market_trends.sql` adds immutable player
identity/crosswalk evidence and schedule games to the same provider snapshot.
The repository exposes freshest-game and market-trend reads by season/week;
market trends remain independent of projections.

Migration `0007_player_matching_and_data_health.sql` adds the durable
`player_match_reviews` queue and append-only `player_match_audit_events`.
Manual resolutions are stored as canonical provider aliases, so they survive
future imports and resolve older immutable records at read time.

Migration `0008_projection_consensus_and_accuracy.sql` adds immutable consensus
snapshots and entries plus outcome/accuracy evidence. Each snapshot records its
source snapshot IDs, weighting configuration/version, calculation version, and
input fingerprint. Accuracy remains queryable by source, position, and horizon
without changing the weights captured by prior snapshots.
