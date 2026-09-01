alter table public.draft_sessions
  add column if not exists keeper_team_slots jsonb not null default '{}'::jsonb;

alter table public.draft_sessions
  drop constraint if exists draft_sessions_keeper_team_slots_object;

alter table public.draft_sessions
  add constraint draft_sessions_keeper_team_slots_object
  check (jsonb_typeof(keeper_team_slots) = 'object');

comment on column public.draft_sessions.keeper_team_slots is
  'Explicit roster-assignment ID to fantasy-team slot mapping used to reserve keeper picks.';
