-- 0010_draft_team_names
--
-- Optional display names for each fantasy team on a live draft board.

alter table draft_sessions
    add column if not exists team_names jsonb not null default '{}'::jsonb;

alter table draft_sessions
    drop constraint if exists draft_sessions_team_names_object;

alter table draft_sessions
    add constraint draft_sessions_team_names_object
    check (jsonb_typeof(team_names) = 'object');

comment on column draft_sessions.team_names is
    'Draft-slot keyed team display names, for example {"1":"My Team","2":"Team Rocket"}.';
