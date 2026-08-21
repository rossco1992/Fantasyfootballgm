-- 0005_historical_context_and_market_trends
--
-- Extends the immutable provider snapshot created by NOC-10 with the two
-- non-signal record kinds needed by NOC-61:
--   * provider-backed canonical player identity/crosswalk evidence
--   * provider-backed NFL schedule/game evidence
--
-- Player history, usage, and market trends continue to use
-- provider_data_records. All three record families are sealed with the same
-- ingestion run so a season/week can be reproduced from one source snapshot.

alter table provider_ingestion_runs
    add column player_identities_received integer not null default 0
      check (player_identities_received >= 0),
    add column player_identities_imported integer not null default 0
      check (player_identities_imported >= 0),
    add column games_received integer not null default 0
      check (games_received >= 0),
    add column games_imported integer not null default 0
      check (games_imported >= 0);

alter table provider_ingestion_rejections
    add column record_kind text not null default 'data'
      check (record_kind in ('data', 'player_identity', 'game'));

alter table provider_ingestion_rejections
    drop constraint if exists provider_ingestion_rejections_ingestion_run_id_record_index_key;

alter table provider_ingestion_rejections
    add constraint provider_ingestion_rejections_run_kind_index_key
      unique (ingestion_run_id, record_kind, record_index);

create table if not exists provider_player_identity_records (
    id                 uuid        primary key default gen_random_uuid(),
    snapshot_id        uuid        not null references provider_data_snapshots(id) on delete restrict,
    player_id          uuid        not null references players(id) on delete restrict,
    external_player_id text        not null check (char_length(trim(external_player_id)) between 1 and 255),
    normalized_payload jsonb       not null,
    raw_payload        jsonb       not null,
    created_at         timestamptz not null default now(),
    unique (snapshot_id, external_player_id)
);

create index if not exists provider_player_identity_records_player_idx
    on provider_player_identity_records (player_id, snapshot_id);

create table if not exists provider_game_records (
    id                 uuid        primary key default gen_random_uuid(),
    snapshot_id        uuid        not null references provider_data_snapshots(id) on delete restrict,
    external_game_id   text        not null check (char_length(trim(external_game_id)) between 1 and 255),
    season             smallint    not null check (season between 2000 and 2100),
    week               smallint    not null check (week between 1 and 22),
    season_type        text        not null check (season_type in ('PRE', 'REG', 'POST')),
    kickoff_at         timestamptz,
    home_team          text        not null check (home_team ~ '^[A-Z]{2,3}$'),
    away_team          text        not null check (away_team ~ '^[A-Z]{2,3}$'),
    home_score         smallint    check (home_score is null or home_score >= 0),
    away_score         smallint    check (away_score is null or away_score >= 0),
    neutral_site       boolean     not null default false,
    raw_payload        jsonb       not null,
    created_at         timestamptz not null default now(),
    check (home_team <> away_team),
    unique (snapshot_id, external_game_id)
);

create index if not exists provider_game_records_scope_idx
    on provider_game_records (season, week, snapshot_id);

comment on table provider_player_identity_records is 'Immutable roster/crosswalk evidence used to resolve provider IDs through the canonical player model.';
comment on table provider_game_records is 'Immutable normalized schedule/game evidence for reproducible season/week matchup context.';

create or replace function require_open_provider_run_for_identity_record()
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

drop trigger if exists provider_player_identities_require_open_run on provider_player_identity_records;
create trigger provider_player_identities_require_open_run
before insert on provider_player_identity_records
for each row execute function require_open_provider_run_for_identity_record();

create or replace function require_open_provider_run_for_game_record()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
      from provider_data_snapshots snapshot
      join provider_ingestion_runs run on run.id = snapshot.ingestion_run_id
     where snapshot.id = new.snapshot_id
       and run.status = 'running'
       and snapshot.season = new.season
       and (snapshot.week is null or snapshot.week = new.week)
  ) then
    raise exception 'provider game must match an open snapshot scope';
  end if;
  return new;
end;
$$;

drop trigger if exists provider_games_require_open_run on provider_game_records;
create trigger provider_games_require_open_run
before insert on provider_game_records
for each row execute function require_open_provider_run_for_game_record();

drop trigger if exists provider_player_identity_records_immutable on provider_player_identity_records;
create trigger provider_player_identity_records_immutable
before update or delete on provider_player_identity_records
for each row execute function prevent_provider_snapshot_mutation();

drop trigger if exists provider_game_records_immutable on provider_game_records;
create trigger provider_game_records_immutable
before update or delete on provider_game_records
for each row execute function prevent_provider_snapshot_mutation();
