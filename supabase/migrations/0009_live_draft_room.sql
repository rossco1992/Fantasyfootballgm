-- 0009_live_draft_room
--
-- App-owned live draft state. Yahoo remains an uploaded data source; picks and
-- queue changes are recorded locally so the board can follow a manual draft.

create table if not exists draft_sessions (
    id         uuid        primary key default gen_random_uuid(),
    league_id  uuid        not null unique references league_configurations(id) on delete cascade,
    season     smallint    not null check (season between 2000 and 2100),
    status     text        not null default 'active' check (status in ('active', 'completed')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists draft_picks (
    id                uuid        primary key default gen_random_uuid(),
    session_id        uuid        not null references draft_sessions(id) on delete cascade,
    player_id         uuid        not null references players(id) on delete restrict,
    overall_pick      integer     not null check (overall_pick > 0),
    round             smallint    not null check (round between 1 and 40),
    pick_in_round     smallint    not null check (pick_in_round > 0),
    fantasy_team_slot smallint    not null check (fantasy_team_slot > 0),
    created_at        timestamptz not null default now(),
    unique (session_id, overall_pick),
    unique (session_id, player_id)
);

create index if not exists draft_picks_session_round_idx
    on draft_picks (session_id, round, pick_in_round);

create table if not exists draft_queue_entries (
    id          uuid        primary key default gen_random_uuid(),
    session_id  uuid        not null references draft_sessions(id) on delete cascade,
    player_id   uuid        not null references players(id) on delete cascade,
    queue_order integer     not null check (queue_order > 0),
    created_at  timestamptz not null default now(),
    unique (session_id, player_id),
    unique (session_id, queue_order)
);

comment on table draft_sessions is 'One app-owned live draft session per configured league.';
comment on table draft_picks is 'Deterministic live pick history used to render the draft board and roster.';
comment on table draft_queue_entries is 'User-controlled player queue for a live draft session.';

alter table draft_sessions enable row level security;
alter table draft_picks enable row level security;
alter table draft_queue_entries enable row level security;

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute 'create policy "Users manage draft sessions for their leagues"
      on draft_sessions for all
      using (exists (
        select 1 from league_configurations league
         where league.id = draft_sessions.league_id and league.user_id = auth.uid()
      ))
      with check (exists (
        select 1 from league_configurations league
         where league.id = draft_sessions.league_id and league.user_id = auth.uid()
      ))';
    execute 'create policy "Users manage picks for their draft sessions"
      on draft_picks for all
      using (exists (
        select 1 from draft_sessions session
        join league_configurations league on league.id = session.league_id
         where session.id = draft_picks.session_id and league.user_id = auth.uid()
      ))
      with check (exists (
        select 1 from draft_sessions session
        join league_configurations league on league.id = session.league_id
         where session.id = draft_picks.session_id and league.user_id = auth.uid()
      ))';
    execute 'create policy "Users manage queues for their draft sessions"
      on draft_queue_entries for all
      using (exists (
        select 1 from draft_sessions session
        join league_configurations league on league.id = session.league_id
         where session.id = draft_queue_entries.session_id and league.user_id = auth.uid()
      ))
      with check (exists (
        select 1 from draft_sessions session
        join league_configurations league on league.id = session.league_id
         where session.id = draft_queue_entries.session_id and league.user_id = auth.uid()
      ))';
  end if;
end
$$;
