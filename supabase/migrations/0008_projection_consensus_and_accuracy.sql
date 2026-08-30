-- 0008_projection_consensus_and_accuracy
--
-- Deterministic, append-only consensus projection snapshots for NOC-59. Raw
-- provider records remain untouched; every derived value records the exact
-- source snapshots, weighting configuration, and calculation version used.

create table if not exists projection_consensus_snapshots (
    id                       uuid        primary key default gen_random_uuid(),
    league_configuration_id  uuid        not null references league_configurations(id) on delete restrict,
    season                   smallint    not null check (season between 2000 and 2100),
    week                     smallint    check (week is null or week between 1 and 22),
    horizon                  text        not null check (horizon in ('preseason', 'weekly', 'rest_of_season')),
    scoring                  text        not null check (scoring in ('standard', 'half_ppr', 'ppr')),
    weighting_version        text        not null check (char_length(trim(weighting_version)) between 1 and 120),
    calculation_version      text        not null check (char_length(trim(calculation_version)) between 1 and 120),
    weighting_config         jsonb       not null,
    source_snapshot_ids      uuid[]      not null,
    input_fingerprint        text        not null check (input_fingerprint ~ '^[a-f0-9]{64}$'),
    generated_at             timestamptz not null,
    created_at               timestamptz not null default now()
);

create unique index if not exists projection_consensus_snapshot_input_idx
    on projection_consensus_snapshots (
      league_configuration_id, season, coalesce(week, 0), horizon,
      input_fingerprint
    );

create index if not exists projection_consensus_snapshot_latest_idx
    on projection_consensus_snapshots (
      league_configuration_id, season, week, horizon, generated_at desc
    );

create table if not exists projection_consensus_entries (
    id                   uuid          primary key default gen_random_uuid(),
    consensus_snapshot_id uuid         not null references projection_consensus_snapshots(id) on delete restrict,
    player_id            uuid          not null references players(id) on delete restrict,
    position             text          not null check (position in ('QB', 'RB', 'WR', 'TE', 'K', 'DST')),
    consensus_points     numeric(10, 4) not null,
    low_points           numeric(10, 4) not null,
    high_points          numeric(10, 4) not null,
    range_points         numeric(10, 4) not null check (range_points >= 0),
    standard_deviation   numeric(10, 4) not null check (standard_deviation >= 0),
    confidence           numeric(6, 4)  not null check (confidence between 0 and 1),
    source_count         smallint       not null check (source_count > 0),
    group_count          smallint       not null check (group_count > 0 and group_count <= source_count),
    components           jsonb          not null,
    created_at           timestamptz    not null default now(),
    unique (consensus_snapshot_id, player_id)
);

create index if not exists projection_consensus_entries_player_idx
    on projection_consensus_entries (player_id, consensus_snapshot_id);

create table if not exists projection_outcomes (
    id                  uuid          primary key default gen_random_uuid(),
    player_id           uuid          not null references players(id) on delete restrict,
    season              smallint      not null check (season between 2000 and 2100),
    week                smallint      check (week is null or week between 1 and 22),
    horizon             text          not null check (horizon in ('preseason', 'weekly', 'rest_of_season')),
    scoring             text          not null check (scoring in ('standard', 'half_ppr', 'ppr')),
    actual_points       numeric(10, 4) not null,
    stats               jsonb         not null,
    source              text          not null check (char_length(trim(source)) between 1 and 160),
    source_fingerprint  text          not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
    observed_at         timestamptz   not null,
    imported_at         timestamptz   not null,
    created_at          timestamptz   not null default now(),
    unique (source, source_fingerprint)
);

create index if not exists projection_outcomes_scope_idx
    on projection_outcomes (season, week, horizon, player_id, observed_at desc);

create table if not exists projection_accuracy_records (
    id                    uuid          primary key default gen_random_uuid(),
    outcome_id            uuid          not null references projection_outcomes(id) on delete restrict,
    consensus_snapshot_id uuid          not null references projection_consensus_snapshots(id) on delete restrict,
    consensus_entry_id    uuid          not null references projection_consensus_entries(id) on delete restrict,
    player_id             uuid          not null references players(id) on delete restrict,
    position              text          not null check (position in ('QB', 'RB', 'WR', 'TE', 'K', 'DST')),
    horizon               text          not null check (horizon in ('preseason', 'weekly', 'rest_of_season')),
    source_type           text          not null check (source_type in ('provider', 'consensus')),
    provider_slug         text          check (provider_slug is null or char_length(trim(provider_slug)) between 1 and 80),
    predicted_points      numeric(10, 4) not null,
    actual_points         numeric(10, 4) not null,
    signed_error          numeric(10, 4) not null,
    absolute_error        numeric(10, 4) not null check (absolute_error >= 0),
    squared_error         numeric(14, 4) not null check (squared_error >= 0),
    evaluated_at          timestamptz   not null,
    created_at            timestamptz   not null default now(),
    check (
      (source_type = 'provider' and provider_slug is not null) or
      (source_type = 'consensus' and provider_slug is null)
    )
);

create unique index if not exists projection_accuracy_record_source_idx
    on projection_accuracy_records (
      outcome_id, consensus_snapshot_id, source_type,
      coalesce(provider_slug, '')
    );

create index if not exists projection_accuracy_summary_idx
    on projection_accuracy_records (
      horizon, position, source_type, provider_slug, evaluated_at desc
    );

comment on table projection_consensus_snapshots is 'Immutable consensus runs with exact input snapshots, weights, and calculation version.';
comment on table projection_consensus_entries is 'Per-player consensus values with disagreement, confidence, and traceable provider components.';
comment on table projection_outcomes is 'Immutable actual-result snapshots used to evaluate projections without rewriting prior predictions.';
comment on table projection_accuracy_records is 'Provider and consensus errors queryable by position and projection horizon.';

create or replace function prevent_projection_evidence_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only; write a new snapshot instead', tg_table_name;
end;
$$;

drop trigger if exists projection_consensus_snapshots_immutable on projection_consensus_snapshots;
create trigger projection_consensus_snapshots_immutable
before update or delete on projection_consensus_snapshots
for each row execute function prevent_projection_evidence_mutation();

drop trigger if exists projection_consensus_entries_immutable on projection_consensus_entries;
create trigger projection_consensus_entries_immutable
before update or delete on projection_consensus_entries
for each row execute function prevent_projection_evidence_mutation();

drop trigger if exists projection_outcomes_immutable on projection_outcomes;
create trigger projection_outcomes_immutable
before update or delete on projection_outcomes
for each row execute function prevent_projection_evidence_mutation();

drop trigger if exists projection_accuracy_records_immutable on projection_accuracy_records;
create trigger projection_accuracy_records_immutable
before update or delete on projection_accuracy_records
for each row execute function prevent_projection_evidence_mutation();
