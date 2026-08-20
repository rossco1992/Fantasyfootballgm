-- 0001_canonical_player_model
--
-- Foundational persistence schema for Fantasy Football GM.
--
-- Implements the canonical, multi-source data model from ADR-002:
--   * The application owns a canonical player identity (`players`).
--   * External provider IDs are stored separately and mapped to the canonical
--     player (`player_external_ids`), never overloaded onto the player row.
--   * Raw provider signals (e.g. projections) retain their `source` (provider)
--     and `source_timestamp` provenance and are stored non-destructively, so
--     multiple sources / snapshots of the same signal coexist. Any consensus or
--     derived values are computed separately in a later story and never
--     overwrite these raw rows.
--
-- Uses only core PostgreSQL features (no extensions): `gen_random_uuid()` is
-- built into PostgreSQL 13+, which both Supabase and the test harness provide.

-- External data sources / providers (e.g. a CSV import, a projections API).
create table if not exists providers (
    id         uuid primary key     default gen_random_uuid(),
    slug       text        not null unique,
    name       text        not null,
    created_at timestamptz not null default now()
);

comment on table providers is 'External fantasy-data sources. Adapters (providers/) normalize payloads into the canonical model before persistence (ADR-003).';

-- Canonical, application-owned player identity.
create table if not exists players (
    id         uuid primary key     default gen_random_uuid(),
    full_name  text        not null,
    position   text        not null check (position in ('QB', 'RB', 'WR', 'TE', 'K', 'DST')),
    nfl_team   text,  -- NFL team abbreviation; null for free agents
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table players is 'Canonical player identity owned by the application (ADR-002). Downstream ranking logic consumes this, not provider-specific payloads.';

-- Mapping of a provider-specific player ID to the canonical player (ADR-002).
create table if not exists player_external_ids (
    id          uuid primary key     default gen_random_uuid(),
    player_id   uuid        not null references players(id)   on delete cascade,
    provider_id uuid        not null references providers(id) on delete cascade,
    external_id text        not null,
    created_at  timestamptz not null default now(),
    -- A given provider's external id maps to exactly one canonical player.
    unique (provider_id, external_id)
);

create index if not exists player_external_ids_player_id_idx on player_external_ids (player_id);

comment on table player_external_ids is 'Maps provider-specific player IDs to the canonical player. Lets providers be added/replaced without changing core models (ADR-002).';

-- Raw, multi-source player projections. Stored non-destructively: source and
-- source_timestamp are part of the identity, so multiple providers and multiple
-- snapshots over time all coexist (ADR-002).
create table if not exists player_projections (
    id               uuid          primary key     default gen_random_uuid(),
    player_id        uuid          not null references players(id)   on delete cascade,
    provider_id      uuid          not null references providers(id) on delete cascade,
    season           smallint      not null,
    week             smallint,  -- null = season-long projection
    scoring          text          not null default 'ppr' check (scoring in ('standard', 'half_ppr', 'ppr')),
    projected_points numeric(6, 2) not null,
    source_timestamp timestamptz   not null,  -- provenance: when the source produced this value
    ingested_at      timestamptz   not null default now(),
    -- Preserve every raw source value / snapshot; do not collapse destructively.
    unique (provider_id, player_id, season, week, scoring, source_timestamp)
);

create index if not exists player_projections_player_id_idx on player_projections (player_id);

comment on table player_projections is 'Raw provider projections with source + timestamp provenance, stored non-destructively (ADR-002). Consensus/derived values are computed separately in a later story.';
