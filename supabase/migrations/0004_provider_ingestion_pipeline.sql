-- 0004_provider_ingestion_pipeline
--
-- Append-only, provider-neutral ingestion storage for NOC-10. Provider
-- adapters normalize their payloads before this boundary. Raw values and the
-- normalized record remain side by side so downstream models never depend on
-- provider-specific responses and source evidence is never destroyed.

create table if not exists provider_ingestion_runs (
    id                    uuid        primary key default gen_random_uuid(),
    provider_id           uuid        not null references providers(id) on delete cascade,
    trigger_type          text        not null check (trigger_type in ('scheduled', 'on_demand')),
    status                text        not null check (status in ('running', 'succeeded', 'partial', 'failed')),
    adapter_version       text        not null check (char_length(trim(adapter_version)) between 1 and 80),
    season                smallint    not null check (season between 2000 and 2100),
    week                  smallint    check (week is null or week between 1 and 22),
    started_at            timestamptz not null,
    completed_at          timestamptz,
    records_received      integer     not null default 0 check (records_received >= 0),
    records_imported      integer     not null default 0 check (records_imported >= 0),
    records_rejected      integer     not null default 0 check (records_rejected >= 0),
    unmatched_player_count integer    not null default 0 check (unmatched_player_count >= 0),
    error_details         jsonb,
    created_at            timestamptz not null default now()
);

create index if not exists provider_ingestion_runs_provider_started_idx
    on provider_ingestion_runs (provider_id, started_at desc);

create table if not exists provider_data_snapshots (
    id                 uuid        primary key default gen_random_uuid(),
    provider_id        uuid        not null references providers(id) on delete cascade,
    ingestion_run_id   uuid        not null unique references provider_ingestion_runs(id) on delete restrict,
    source_fingerprint text        not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
    adapter_version    text        not null check (char_length(trim(adapter_version)) between 1 and 80),
    season             smallint    not null check (season between 2000 and 2100),
    week               smallint    check (week is null or week between 1 and 22),
    observed_at        timestamptz not null,
    imported_at        timestamptz not null,
    provenance         jsonb       not null,
    created_at         timestamptz not null default now(),
    unique (provider_id, source_fingerprint)
);

create index if not exists provider_data_snapshots_freshness_idx
    on provider_data_snapshots (provider_id, season, week, observed_at desc, imported_at desc);

create table if not exists provider_data_records (
    id                 uuid        primary key default gen_random_uuid(),
    snapshot_id        uuid        not null references provider_data_snapshots(id) on delete restrict,
    player_id          uuid        references players(id) on delete set null,
    external_player_id text        not null check (char_length(trim(external_player_id)) between 1 and 255),
    data_type          text        not null check (data_type in (
      'projection', 'ranking', 'adp', 'injury', 'news',
      'historical_performance', 'usage', 'market_trend'
    )),
    record_key         text        not null check (char_length(trim(record_key)) between 1 and 255),
    normalized_payload jsonb       not null,
    raw_payload        jsonb       not null,
    created_at         timestamptz not null default now(),
    unique (snapshot_id, data_type, external_player_id, record_key)
);

create index if not exists provider_data_records_player_type_idx
    on provider_data_records (player_id, data_type, snapshot_id)
    where player_id is not null;

create index if not exists provider_data_records_external_player_idx
    on provider_data_records (external_player_id, data_type, snapshot_id);

create table if not exists provider_ingestion_rejections (
    id             uuid        primary key default gen_random_uuid(),
    ingestion_run_id uuid      not null references provider_ingestion_runs(id) on delete cascade,
    record_index   integer     not null check (record_index >= 0),
    raw_payload    jsonb       not null,
    validation_errors jsonb    not null,
    created_at     timestamptz not null default now(),
    unique (ingestion_run_id, record_index)
);

create table if not exists provider_ingestion_state (
    provider_id          uuid        primary key references providers(id) on delete cascade,
    last_attempt_at      timestamptz not null,
    last_success_at      timestamptz,
    latest_snapshot_id   uuid        references provider_data_snapshots(id) on delete restrict,
    last_status          text        not null check (last_status in ('running', 'succeeded', 'partial', 'failed')),
    stale_after_seconds  integer     not null check (stale_after_seconds > 0),
    consecutive_failures integer     not null default 0 check (consecutive_failures >= 0),
    last_error           jsonb,
    updated_at           timestamptz not null
);

comment on table provider_ingestion_runs is 'Every scheduled or on-demand provider attempt, including partial and failed runs.';
comment on table provider_data_snapshots is 'Immutable provider deliveries identified by a deterministic source fingerprint.';
comment on table provider_data_records is 'Validated normalized records with their original raw provider values retained beside them.';
comment on table provider_ingestion_rejections is 'Per-record validation failures retained for inspection without contaminating normalized data.';
comment on table provider_ingestion_state is 'Current provider freshness and failure state; failed runs never replace the last valid snapshot.';

-- A snapshot and its records are assembled only while their ingestion run is
-- open. Once the run reaches a terminal status, its contents are sealed.
create or replace function require_open_provider_run_for_snapshot()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
      from provider_ingestion_runs run
     where run.id = new.ingestion_run_id
       and run.status = 'running'
       and run.provider_id = new.provider_id
       and run.adapter_version = new.adapter_version
       and run.season = new.season
       and run.week is not distinct from new.week
  ) then
    raise exception 'provider snapshot must match an open ingestion run';
  end if;
  return new;
end;
$$;

drop trigger if exists provider_data_snapshots_require_open_run on provider_data_snapshots;
create trigger provider_data_snapshots_require_open_run
before insert on provider_data_snapshots
for each row execute function require_open_provider_run_for_snapshot();

create or replace function require_open_provider_run_for_record()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
      from provider_data_snapshots snapshot
      join provider_ingestion_runs run on run.id = snapshot.ingestion_run_id
     where snapshot.id = new.snapshot_id and run.status = 'running'
  ) then
    raise exception 'provider snapshot is sealed; write a new snapshot instead';
  end if;
  return new;
end;
$$;

drop trigger if exists provider_data_records_require_open_run on provider_data_records;
create trigger provider_data_records_require_open_run
before insert on provider_data_records
for each row execute function require_open_provider_run_for_record();

-- Snapshots and their records are evidence. Corrections arrive as a new
-- snapshot rather than mutating history.
create or replace function prevent_provider_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only; write a new provider snapshot instead', tg_table_name;
end;
$$;

drop trigger if exists provider_data_snapshots_immutable on provider_data_snapshots;
create trigger provider_data_snapshots_immutable
before update or delete on provider_data_snapshots
for each row execute function prevent_provider_snapshot_mutation();

drop trigger if exists provider_data_records_immutable on provider_data_records;
create trigger provider_data_records_immutable
before update or delete on provider_data_records
for each row execute function prevent_provider_snapshot_mutation();
