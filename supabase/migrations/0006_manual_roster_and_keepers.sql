-- 0006_manual_roster_and_keepers
--
-- Manual roster and keeper setup for leagues that are not connected to a
-- provider. Canonical player identity remains separate from the league-owned
-- assignment. Keeper history and cost are explicit so draft services can
-- reserve the correct slot without inferring league rules.

create table if not exists league_roster_assignments (
    id                    uuid        primary key default gen_random_uuid(),
    league_id             uuid        not null references league_configurations(id) on delete cascade,
    player_id             uuid        not null references players(id) on delete restrict,
    fantasy_team_name     text        not null check (char_length(trim(fantasy_team_name)) between 1 and 80),
    acquisition_type      text        not null check (acquisition_type in ('drafted', 'waiver', 'free_agent', 'unknown')),
    is_keeper             boolean     not null default false,
    original_draft_season smallint    check (original_draft_season between 2000 and 2100),
    original_draft_round  smallint    check (original_draft_round between 1 and 40),
    keeper_season         smallint    check (keeper_season between 2000 and 2100),
    keeper_cost_round     smallint    check (keeper_cost_round between 1 and 40),
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    unique (league_id, player_id),
    constraint keeper_history_complete check (
      (not is_keeper and keeper_season is null and keeper_cost_round is null) or
      (is_keeper and acquisition_type = 'drafted' and
        original_draft_season is not null and original_draft_round is not null and
        keeper_season = original_draft_season + 1 and
        keeper_cost_round = original_draft_round)
    )
);

create unique index if not exists league_keeper_round_per_team_idx
    on league_roster_assignments (league_id, lower(fantasy_team_name), keeper_cost_round)
    where is_keeper;

create index if not exists league_roster_assignments_league_idx
    on league_roster_assignments (league_id, fantasy_team_name, is_keeper desc);

comment on table league_roster_assignments is 'League-owned manual roster state linked to canonical players; keeper cost remains explicit and deterministic.';

alter table league_roster_assignments enable row level security;

do $$
begin
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute 'create policy "Users manage roster assignments for their leagues"
      on league_roster_assignments for all
      using (exists (
        select 1 from league_configurations league
         where league.id = league_roster_assignments.league_id
           and league.user_id = auth.uid()
      ))
      with check (exists (
        select 1 from league_configurations league
         where league.id = league_roster_assignments.league_id
           and league.user_id = auth.uid()
      ))';
  end if;
end
$$;
