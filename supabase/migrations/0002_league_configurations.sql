-- 0002_league_configurations
--
-- A user's league rules are first-class structured data consumed by ranking
-- and draft services. Explicit roster columns keep the downstream contract
-- queryable and ensure invalid values are rejected at the database boundary.

create table if not exists league_configurations (
    id             uuid        primary key default gen_random_uuid(),
    user_id        uuid        not null unique,
    name           text        not null check (char_length(trim(name)) between 1 and 80),
    team_count     smallint    not null check (team_count between 4 and 20),
    draft_type     text        not null check (draft_type in ('snake', 'linear')),
    draft_position smallint    not null check (draft_position between 1 and team_count),
    scoring_preset text        not null check (scoring_preset in ('standard', 'half_ppr', 'ppr')),
    qb_slots        smallint    not null check (qb_slots between 0 and 10),
    rb_slots        smallint    not null check (rb_slots between 0 and 10),
    wr_slots        smallint    not null check (wr_slots between 0 and 10),
    te_slots        smallint    not null check (te_slots between 0 and 10),
    flex_slots      smallint    not null check (flex_slots between 0 and 10),
    superflex_slots smallint    not null check (superflex_slots between 0 and 10),
    k_slots         smallint    not null check (k_slots between 0 and 10),
    dst_slots       smallint    not null check (dst_slots between 0 and 10),
    bench_slots     smallint    not null check (bench_slots between 0 and 20),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint league_has_starter check (
      qb_slots + rb_slots + wr_slots + te_slots + flex_slots +
      superflex_slots + k_slots + dst_slots > 0
    ),
    constraint league_roster_size check (
      qb_slots + rb_slots + wr_slots + te_slots + flex_slots +
      superflex_slots + k_slots + dst_slots + bench_slots <= 40
    )
);

comment on table league_configurations is 'Validated league rules consumed by ranking and draft services.';

alter table league_configurations enable row level security;

-- Supabase provides auth.uid(). The local in-process migration test does not,
-- so create the user policy only when that Supabase function is available.
do $$
begin
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute 'create policy "Users manage their league configuration"
      on league_configurations for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id)';
  end if;
end
$$;
