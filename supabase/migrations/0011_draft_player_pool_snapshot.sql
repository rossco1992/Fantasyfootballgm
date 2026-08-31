-- 0011_draft_player_pool_snapshot
--
-- Bind each live draft to the exact Yahoo CSV snapshot selected at setup so
-- old or later uploads cannot silently change the available-player pool.

alter table draft_sessions
    add column if not exists player_pool_snapshot_id uuid
    references provider_data_snapshots(id) on delete restrict;

update draft_sessions
   set player_pool_snapshot_id = (
       select snapshot.id
         from provider_data_snapshots snapshot
         join providers provider on provider.id = snapshot.provider_id
        where provider.slug like 'yahoo-csv%'
        order by snapshot.observed_at desc, snapshot.imported_at desc
        limit 1
   )
 where player_pool_snapshot_id is null
   and exists (
       select 1
         from provider_data_snapshots snapshot
         join providers provider on provider.id = snapshot.provider_id
        where provider.slug like 'yahoo-csv%'
   );

create index if not exists draft_sessions_player_pool_snapshot_idx
    on draft_sessions (player_pool_snapshot_id);

comment on column draft_sessions.player_pool_snapshot_id is
    'Exact Yahoo CSV snapshot that defines this draft session player pool.';
