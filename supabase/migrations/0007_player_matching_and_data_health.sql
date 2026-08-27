-- 0007_player_matching_and_data_health
--
-- Durable review and audit records for cross-provider identity resolution.
-- Ambiguous/unmatched source records stay outside the canonical player model
-- until a human explicitly resolves them; future imports reuse the resulting
-- player_external_ids mapping.

create table if not exists player_match_reviews (
    id                      uuid        primary key default gen_random_uuid(),
    provider_id             uuid        not null references providers(id) on delete cascade,
    external_player_id      text        not null check (char_length(trim(external_player_id)) between 1 and 255),
    latest_ingestion_run_id uuid        references provider_ingestion_runs(id) on delete set null,
    reason                  text        not null check (reason in ('unmatched', 'ambiguous', 'conflicting_external_ids')),
    status                  text        not null default 'open' check (status in ('open', 'resolved')),
    candidate_player_ids    uuid[]      not null default '{}',
    evidence                jsonb       not null default '{}'::jsonb,
    occurrences             integer     not null default 1 check (occurrences > 0),
    resolved_player_id      uuid        references players(id) on delete restrict,
    resolved_by_user_id     uuid,
    first_seen_at           timestamptz not null default now(),
    last_seen_at            timestamptz not null default now(),
    resolved_at             timestamptz,
    unique (provider_id, external_player_id),
    check (
      (status = 'open' and resolved_player_id is null and resolved_at is null)
      or
      (status = 'resolved' and resolved_player_id is not null and resolved_at is not null)
    )
);

create index if not exists player_match_reviews_open_idx
    on player_match_reviews (last_seen_at desc)
    where status = 'open';

create index if not exists player_match_reviews_provider_status_idx
    on player_match_reviews (provider_id, status);

create table if not exists player_match_audit_events (
    id                    uuid        primary key default gen_random_uuid(),
    provider_id           uuid        not null references providers(id) on delete cascade,
    external_player_id    text        not null check (char_length(trim(external_player_id)) between 1 and 255),
    ingestion_run_id      uuid        references provider_ingestion_runs(id) on delete restrict,
    player_id             uuid        references players(id) on delete restrict,
    event_type            text        not null check (event_type in (
      'matched', 'created', 'queued', 'manual_override'
    )),
    strategy              text        not null check (strategy in (
      'provider_external_id', 'provider_alias',
      'normalized_name_position', 'normalized_name_position_team',
      'created_canonical', 'manual_override', 'none'
    )),
    candidate_player_ids  uuid[]      not null default '{}',
    evidence              jsonb       not null default '{}'::jsonb,
    actor_user_id         uuid,
    created_at            timestamptz not null default now()
);

create index if not exists player_match_audit_provider_external_idx
    on player_match_audit_events (provider_id, external_player_id, created_at desc);

comment on table player_match_reviews is 'Durable queue for ambiguous or unmatched provider player IDs. Resolutions survive future imports through player_external_ids.';
comment on table player_match_audit_events is 'Append-only evidence for automated and manual canonical player matching decisions.';

drop trigger if exists player_match_audit_events_immutable on player_match_audit_events;
create trigger player_match_audit_events_immutable
before update or delete on player_match_audit_events
for each row execute function prevent_provider_snapshot_mutation();
