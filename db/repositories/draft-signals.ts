import type { QueryResultRow } from "pg";

import { query } from "@/db/client";
import {
  normalizedAdpSchema,
  normalizedInjurySchema,
  normalizedNewsSchema,
  normalizedRankingSchema,
  sourceProvenanceSchema,
  type SourceCoverage,
} from "@/domain/fantasy-data";
import type { PlayerStatus } from "@/domain/player";

export type FantasyProsDraftSignal = {
  playerId: string;
  rank: number | null;
  positionRank: number | null;
  tier: number | null;
  expertCount: number | null;
  adp: number | null;
  injuryStatus: PlayerStatus | null;
  injuryDetails: string | null;
  newsHeadline: string | null;
  newsSummary: string | null;
  newsPublishedAt: Date | null;
};

export type FantasyProsDraftData = {
  snapshotId: string;
  observedAt: Date;
  coverage: SourceCoverage[];
  signals: FantasyProsDraftSignal[];
};

type DraftSignalRow = QueryResultRow & {
  snapshot_id: string;
  observed_at: Date;
  provenance: unknown;
  player_id: string | null;
  data_type: string | null;
  normalized_payload: unknown;
};

function emptySignal(playerId: string): FantasyProsDraftSignal {
  return {
    playerId,
    rank: null,
    positionRank: null,
    tier: null,
    expertCount: null,
    adp: null,
    injuryStatus: null,
    injuryDetails: null,
    newsHeadline: null,
    newsSummary: null,
    newsPublishedAt: null,
  };
}

/** Latest preseason FantasyPros market, availability, and news signals. */
export async function getLatestFantasyProsDraftData(
  season: number,
): Promise<FantasyProsDraftData | null> {
  const result = await query<DraftSignalRow>(
    `with latest_snapshot as (
       select snapshot.id, snapshot.observed_at, snapshot.provenance
         from provider_data_snapshots snapshot
         join providers provider on provider.id = snapshot.provider_id
        where provider.slug = 'fantasypros'
          and snapshot.season = $1
          and snapshot.week is null
        order by snapshot.observed_at desc, snapshot.imported_at desc,
                 snapshot.id desc
        limit 1
     )
     select snapshot.id as snapshot_id, snapshot.observed_at,
            snapshot.provenance, record.player_id, record.data_type,
            record.normalized_payload
       from latest_snapshot snapshot
       left join provider_data_records record on record.snapshot_id = snapshot.id
        and record.data_type in ('ranking', 'adp', 'injury', 'news')
      order by record.player_id, record.data_type, record.created_at desc`,
    [season],
  );
  const first = result.rows[0];
  if (!first) return null;

  const signals = new Map<string, FantasyProsDraftSignal>();
  for (const row of result.rows) {
    if (!row.player_id || !row.data_type) continue;
    const current = signals.get(row.player_id) ?? emptySignal(row.player_id);
    if (row.data_type === "ranking") {
      const ranking = normalizedRankingSchema.parse(row.normalized_payload);
      current.rank = ranking.rank;
      current.positionRank = ranking.positionRank;
      current.tier = ranking.tier;
      current.expertCount = ranking.expertCount;
    } else if (row.data_type === "adp") {
      current.adp = normalizedAdpSchema.parse(row.normalized_payload).overall;
    } else if (row.data_type === "injury") {
      const injury = normalizedInjurySchema.parse(row.normalized_payload);
      current.injuryStatus = injury.status;
      current.injuryDetails = injury.details;
    } else if (row.data_type === "news") {
      const news = normalizedNewsSchema.parse(row.normalized_payload);
      const publishedAt = new Date(news.publishedAt);
      if (
        current.newsPublishedAt === null ||
        publishedAt > current.newsPublishedAt
      ) {
        current.newsHeadline = news.headline;
        current.newsSummary = news.summary;
        current.newsPublishedAt = publishedAt;
      }
    }
    signals.set(row.player_id, current);
  }
  const provenance = sourceProvenanceSchema.safeParse(first.provenance);
  return {
    snapshotId: first.snapshot_id,
    observedAt: first.observed_at,
    coverage: provenance.success ? (provenance.data.coverage ?? []) : [],
    signals: [...signals.values()],
  };
}
