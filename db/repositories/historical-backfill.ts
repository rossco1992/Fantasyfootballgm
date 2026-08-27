import { query } from "@/db/client";
import { jsonValueSchema } from "@/domain/fantasy-data";

export type HistoricalBackfillScope = {
  runId: string;
  season: number;
  week: number;
  status: "running" | "succeeded" | "partial" | "failed";
  startedAt: Date;
  completedAt: Date | null;
  recordsReceived: number;
  recordsImported: number;
  recordsRejected: number;
  unmatchedPlayerCount: number;
  playerIdentitiesImported: number;
  gamesImported: number;
  errorDetails: ReturnType<typeof jsonValueSchema.parse> | null;
  hasUsableSnapshot: boolean;
};

type HistoricalBackfillScopeRow = {
  run_id: string;
  season: number;
  week: number;
  status: HistoricalBackfillScope["status"];
  started_at: Date;
  completed_at: Date | null;
  records_received: number;
  records_imported: number;
  records_rejected: number;
  unmatched_player_count: number;
  player_identities_imported: number;
  games_imported: number;
  error_details: unknown;
  has_usable_snapshot: boolean;
};

function mapScope(row: HistoricalBackfillScopeRow): HistoricalBackfillScope {
  return {
    runId: row.run_id,
    season: row.season,
    week: row.week,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    recordsReceived: row.records_received,
    recordsImported: row.records_imported,
    recordsRejected: row.records_rejected,
    unmatchedPlayerCount: row.unmatched_player_count,
    playerIdentitiesImported: row.player_identities_imported,
    gamesImported: row.games_imported,
    errorDetails:
      row.error_details === null
        ? null
        : jsonValueSchema.parse(row.error_details),
    hasUsableSnapshot: row.has_usable_snapshot,
  };
}

export async function hasCompletedHistoricalScope(
  providerSlug: string,
  season: number,
  week: number,
): Promise<boolean> {
  const result = await query<{ complete: boolean }>(
    `select coalesce((
       select run.status = 'succeeded'
         from provider_ingestion_runs run
         join providers provider on provider.id = run.provider_id
        where provider.slug = $1 and run.season = $2 and run.week = $3
        order by run.started_at desc, run.id desc
        limit 1
     ), false) as complete`,
    [providerSlug, season, week],
  );
  return result.rows[0]?.complete ?? false;
}

export async function listHistoricalBackfillScopes(
  providerSlug: string,
): Promise<HistoricalBackfillScope[]> {
  const result = await query<HistoricalBackfillScopeRow>(
    `select distinct on (run.season, run.week)
            run.id as run_id, run.season, run.week, run.status,
            run.started_at, run.completed_at, run.records_received,
            case
              when run.records_imported = 0 then coalesce((
                select count(*)::int
                  from provider_data_records record
                 where record.snapshot_id = (
                   select snapshot.id
                     from provider_data_snapshots snapshot
                    where snapshot.provider_id = run.provider_id
                      and snapshot.season = run.season
                      and snapshot.week = run.week
                    order by snapshot.imported_at desc, snapshot.id desc
                    limit 1
                 )
              ), 0)
              else run.records_imported
            end as records_imported,
            run.records_rejected,
            run.unmatched_player_count, run.player_identities_imported,
            run.games_imported, run.error_details,
            exists (
              select 1 from provider_data_snapshots snapshot
               where snapshot.provider_id = run.provider_id
                 and snapshot.season = run.season
                 and snapshot.week = run.week
            ) as has_usable_snapshot
       from provider_ingestion_runs run
       join providers provider on provider.id = run.provider_id
      where provider.slug = $1 and run.week is not null
      order by run.season desc, run.week desc, run.started_at desc, run.id desc`,
    [providerSlug],
  );
  return result.rows.map(mapScope);
}
