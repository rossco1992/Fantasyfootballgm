-- 0003_canonical_player_details
--
-- Completes the canonical NFL player representation from NOC-9. A player's
-- UUID is the stable identity; team, bye week, and status are mutable
-- attributes and never participate in uniqueness.

alter table players
    add column bye_week smallint,
    add column status text not null default 'active';

alter table players
    add constraint players_full_name_present
      check (char_length(trim(full_name)) between 1 and 120),
    add constraint players_nfl_team_format
      check (nfl_team is null or nfl_team ~ '^[A-Z]{2,3}$'),
    add constraint players_bye_week_range
      check (bye_week is null or bye_week between 1 and 22),
    add constraint players_status_valid
      check (status in (
        'active', 'questionable', 'doubtful', 'out', 'injured_reserve',
        'physically_unable_to_perform', 'suspended', 'inactive', 'retired',
        'unknown'
      ));

alter table player_external_ids
    add constraint player_external_ids_external_id_present
      check (char_length(trim(external_id)) between 1 and 255);

-- Speeds up fallback candidate retrieval. This is intentionally not unique:
-- real players can share a name and position, so ambiguous matches require
-- review instead of being silently merged.
create index if not exists players_name_position_idx
    on players (lower(full_name), position);

comment on column players.bye_week is 'Current known bye week; null when unknown or not applicable.';
comment on column players.status is 'Normalized player availability/status mapped by provider adapters.';
