import type { QueryResultRow } from "pg";

import { query, withTransaction } from "@/db/client";
import { normalizedProjectionSchema } from "@/domain/fantasy-data";
import type { PlayerPosition } from "@/domain/player";
import {
  type ConsensusScoring,
  type PlayerProjectionConsensus,
  type ProjectionAccuracyRecord,
  type ProjectionConsensusComponent,
  type ProjectionHorizon,
  type ProjectionWeightingConfig,
  consensusScoringSchema,
  projectionConsensusComponentSchema,
  projectionHorizonSchema,
  projectionWeightingConfigSchema,
} from "@/domain/projection-consensus";

export type LatestProjectionSourceRecord = {
  providerId: string;
  providerSlug: string;
  snapshotId: string;
  observedAt: Date;
  playerId: string;
  position: PlayerPosition;
  scoring: ConsensusScoring | null;
  projectedPoints: number | null;
  stats: Record<string, number>;
};

export type PersistConsensusSnapshotInput = {
  leagueConfigurationId: string;
  season: number;
  week: number | null;
  horizon: ProjectionHorizon;
  scoring: ConsensusScoring;
  weightingConfig: ProjectionWeightingConfig;
  calculationVersion: string;
  sourceSnapshotIds: string[];
  inputFingerprint: string;
  generatedAt: Date;
  entries: PlayerProjectionConsensus[];
};

export type PersistedConsensusEntry = PlayerProjectionConsensus & {
  id: string;
  consensusSnapshotId: string;
};

export type PersistedConsensusSnapshot = {
  id: string;
  leagueConfigurationId: string;
  season: number;
  week: number | null;
  horizon: ProjectionHorizon;
  scoring: ConsensusScoring;
  weightingConfig: ProjectionWeightingConfig;
  weightingVersion: string;
  calculationVersion: string;
  sourceSnapshotIds: string[];
  inputFingerprint: string;
  generatedAt: Date;
  entries: PersistedConsensusEntry[];
};

export type ProjectionOutcomeEvaluationInput = {
  consensusSnapshotId: string;
  consensusEntryId: string;
  playerId: string;
  position: PlayerPosition;
  season: number;
  week: number | null;
  horizon: ProjectionHorizon;
  scoring: ConsensusScoring;
  actualPoints: number;
  stats: Record<string, number>;
  source: string;
  sourceFingerprint: string;
  observedAt: Date;
  importedAt: Date;
  evaluatedAt: Date;
  accuracy: ProjectionAccuracyRecord[];
};

export type ProjectionAccuracySummary = {
  position: PlayerPosition;
  horizon: ProjectionHorizon;
  sourceType: "provider" | "consensus";
  providerSlug: string | null;
  sampleSize: number;
  meanAbsoluteError: number;
  rootMeanSquaredError: number;
  meanSignedError: number;
};

type LatestProjectionRow = QueryResultRow & {
  provider_id: string;
  provider_slug: string;
  snapshot_id: string;
  observed_at: Date;
  player_id: string;
  position: PlayerPosition;
  normalized_payload: unknown;
};

const LATEST_PROJECTION_SOURCES_SQL = `with latest_snapshots as (
  select distinct on (snapshot.provider_id)
         snapshot.provider_id, snapshot.id as snapshot_id
    from provider_data_snapshots snapshot
    join provider_data_records record on record.snapshot_id = snapshot.id
   where record.data_type = 'projection'
     and snapshot.season = $1
     and (($2::smallint is null and snapshot.week is null) or snapshot.week = $2)
   order by snapshot.provider_id, snapshot.observed_at desc,
            snapshot.imported_at desc, snapshot.id desc
)
select snapshot.provider_id, provider.slug as provider_slug,
       snapshot.id as snapshot_id, snapshot.observed_at,
       coalesce(resolved_identity.player_id, record.player_id) as player_id,
       player.position, record.normalized_payload
  from latest_snapshots latest
  join provider_data_snapshots snapshot on snapshot.id = latest.snapshot_id
  join provider_data_records record on record.snapshot_id = latest.snapshot_id
  join providers provider on provider.id = snapshot.provider_id
  left join player_external_ids resolved_identity
    on resolved_identity.provider_id = snapshot.provider_id
   and resolved_identity.external_id = record.external_player_id
  join players player
    on player.id = coalesce(resolved_identity.player_id, record.player_id)
 where record.data_type = 'projection'
 order by player.id, provider.slug, record.record_key`;

/** Latest immutable projection snapshot per provider for a season/week scope. */
export async function listLatestProjectionSources(input: {
  season: number;
  week: number | null;
}): Promise<LatestProjectionSourceRecord[]> {
  const result = await query<LatestProjectionRow>(
    LATEST_PROJECTION_SOURCES_SQL,
    [input.season, input.week],
  );
  return result.rows.map((row) => {
    const projection = normalizedProjectionSchema.parse(row.normalized_payload);
    return {
      providerId: row.provider_id,
      providerSlug: row.provider_slug,
      snapshotId: row.snapshot_id,
      observedAt: row.observed_at,
      playerId: row.player_id,
      position: row.position,
      scoring: projection.scoring,
      projectedPoints: projection.projectedPoints,
      stats: projection.stats,
    };
  });
}

type ConsensusSnapshotRow = QueryResultRow & {
  id: string;
  league_configuration_id: string;
  season: number;
  week: number | null;
  horizon: string;
  scoring: string;
  weighting_version: string;
  calculation_version: string;
  weighting_config: unknown;
  source_snapshot_ids: string[];
  input_fingerprint: string;
  generated_at: Date;
};

type ConsensusEntryRow = QueryResultRow & {
  id: string;
  consensus_snapshot_id: string;
  player_id: string;
  position: PlayerPosition;
  consensus_points: string | number;
  low_points: string | number;
  high_points: string | number;
  range_points: string | number;
  standard_deviation: string | number;
  confidence: string | number;
  source_count: number;
  group_count: number;
  components: unknown;
};

const SNAPSHOT_COLUMNS = `id, league_configuration_id, season, week, horizon,
  scoring, weighting_version, calculation_version, weighting_config,
  source_snapshot_ids, input_fingerprint, generated_at`;
const ENTRY_COLUMNS = `id, consensus_snapshot_id, player_id, position,
  consensus_points, low_points, high_points, range_points, standard_deviation,
  confidence, source_count, group_count, components`;

function mapEntry(row: ConsensusEntryRow): PersistedConsensusEntry {
  const components = Array.isArray(row.components)
    ? row.components.map((component) =>
        projectionConsensusComponentSchema.parse(component),
      )
    : [];
  return {
    id: row.id,
    consensusSnapshotId: row.consensus_snapshot_id,
    playerId: row.player_id,
    position: row.position,
    consensusPoints: Number(row.consensus_points),
    lowPoints: Number(row.low_points),
    highPoints: Number(row.high_points),
    rangePoints: Number(row.range_points),
    standardDeviation: Number(row.standard_deviation),
    confidence: Number(row.confidence),
    sourceCount: row.source_count,
    groupCount: row.group_count,
    components,
  };
}

async function loadEntries(
  client: {
    query<T extends QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<{ rows: T[] }>;
  },
  snapshotId: string,
): Promise<PersistedConsensusEntry[]> {
  const result = await client.query<ConsensusEntryRow>(
    `select ${ENTRY_COLUMNS}
       from projection_consensus_entries
      where consensus_snapshot_id = $1
      order by position, consensus_points desc, player_id`,
    [snapshotId],
  );
  return result.rows.map(mapEntry);
}

function mapSnapshot(
  row: ConsensusSnapshotRow,
  entries: PersistedConsensusEntry[],
): PersistedConsensusSnapshot {
  return {
    id: row.id,
    leagueConfigurationId: row.league_configuration_id,
    season: row.season,
    week: row.week,
    horizon: projectionHorizonSchema.parse(row.horizon),
    scoring: consensusScoringSchema.parse(row.scoring),
    weightingVersion: row.weighting_version,
    weightingConfig: projectionWeightingConfigSchema.parse(
      row.weighting_config,
    ),
    calculationVersion: row.calculation_version,
    sourceSnapshotIds: row.source_snapshot_ids,
    inputFingerprint: row.input_fingerprint,
    generatedAt: row.generated_at,
    entries,
  };
}

export async function persistConsensusSnapshot(
  input: PersistConsensusSnapshotInput,
): Promise<PersistedConsensusSnapshot> {
  const weighting = projectionWeightingConfigSchema.parse(
    input.weightingConfig,
  );
  if (!/^[a-f0-9]{64}$/.test(input.inputFingerprint)) {
    throw new Error(
      "Consensus input fingerprint must be a SHA-256 hex digest.",
    );
  }
  return withTransaction(async (client) => {
    const inserted = await client.query<ConsensusSnapshotRow>(
      `insert into projection_consensus_snapshots (
         league_configuration_id, season, week, horizon, scoring,
         weighting_version, calculation_version, weighting_config,
         source_snapshot_ids, input_fingerprint, generated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::uuid[], $10, $11)
       on conflict do nothing
       returning ${SNAPSHOT_COLUMNS}`,
      [
        input.leagueConfigurationId,
        input.season,
        input.week,
        input.horizon,
        input.scoring,
        weighting.version,
        input.calculationVersion,
        JSON.stringify(weighting),
        input.sourceSnapshotIds,
        input.inputFingerprint,
        input.generatedAt,
      ],
    );

    let snapshot = inserted.rows[0];
    if (snapshot) {
      for (const entry of input.entries) {
        await client.query(
          `insert into projection_consensus_entries (
             consensus_snapshot_id, player_id, position, consensus_points,
             low_points, high_points, range_points, standard_deviation,
             confidence, source_count, group_count, components
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
          [
            snapshot.id,
            entry.playerId,
            entry.position,
            entry.consensusPoints,
            entry.lowPoints,
            entry.highPoints,
            entry.rangePoints,
            entry.standardDeviation,
            entry.confidence,
            entry.sourceCount,
            entry.groupCount,
            JSON.stringify(entry.components),
          ],
        );
      }
    } else {
      const existing = await client.query<ConsensusSnapshotRow>(
        `select ${SNAPSHOT_COLUMNS}
           from projection_consensus_snapshots
          where league_configuration_id = $1
            and season = $2
            and week is not distinct from $3
            and horizon = $4
            and input_fingerprint = $5`,
        [
          input.leagueConfigurationId,
          input.season,
          input.week,
          input.horizon,
          input.inputFingerprint,
        ],
      );
      snapshot = existing.rows[0];
    }
    if (!snapshot) throw new Error("Consensus snapshot was not persisted.");
    return mapSnapshot(snapshot, await loadEntries(client, snapshot.id));
  });
}

export async function getConsensusSnapshot(
  snapshotId: string,
): Promise<PersistedConsensusSnapshot | null> {
  const snapshotResult = await query<ConsensusSnapshotRow>(
    `select ${SNAPSHOT_COLUMNS}
       from projection_consensus_snapshots
      where id = $1`,
    [snapshotId],
  );
  const snapshot = snapshotResult.rows[0];
  if (!snapshot) return null;
  return mapSnapshot(snapshot, await loadEntries({ query }, snapshot.id));
}

export async function getLatestConsensusSnapshotForLeague(input: {
  leagueConfigurationId: string;
  season: number;
  week: number | null;
  horizon: ProjectionHorizon;
}): Promise<PersistedConsensusSnapshot | null> {
  const result = await query<ConsensusSnapshotRow>(
    `select ${SNAPSHOT_COLUMNS}
       from projection_consensus_snapshots
      where league_configuration_id = $1
        and season = $2
        and week is not distinct from $3
        and horizon = $4
      order by generated_at desc, created_at desc
      limit 1`,
    [input.leagueConfigurationId, input.season, input.week, input.horizon],
  );
  const snapshot = result.rows[0];
  if (!snapshot) return null;
  return mapSnapshot(snapshot, await loadEntries({ query }, snapshot.id));
}

export async function persistProjectionOutcomeEvaluation(
  input: ProjectionOutcomeEvaluationInput,
): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(input.sourceFingerprint)) {
    throw new Error(
      "Projection outcome fingerprint must be a SHA-256 hex digest.",
    );
  }
  await withTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `insert into projection_outcomes (
         player_id, season, week, horizon, scoring, actual_points, stats,
         source, source_fingerprint, observed_at, imported_at
       ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
       on conflict (source, source_fingerprint) do nothing
       returning id`,
      [
        input.playerId,
        input.season,
        input.week,
        input.horizon,
        input.scoring,
        input.actualPoints,
        JSON.stringify(input.stats),
        input.source,
        input.sourceFingerprint,
        input.observedAt,
        input.importedAt,
      ],
    );
    let outcomeId = inserted.rows[0]?.id;
    if (!outcomeId) {
      const existing = await client.query<{ id: string }>(
        `select id from projection_outcomes
          where source = $1 and source_fingerprint = $2`,
        [input.source, input.sourceFingerprint],
      );
      outcomeId = existing.rows[0]?.id;
    }
    if (!outcomeId) throw new Error("Projection outcome was not persisted.");

    for (const accuracy of input.accuracy) {
      await client.query(
        `insert into projection_accuracy_records (
           outcome_id, consensus_snapshot_id, consensus_entry_id, player_id,
           position, horizon, source_type, provider_slug, predicted_points,
           actual_points, signed_error, absolute_error, squared_error,
           evaluated_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         on conflict do nothing`,
        [
          outcomeId,
          input.consensusSnapshotId,
          input.consensusEntryId,
          input.playerId,
          input.position,
          input.horizon,
          accuracy.sourceType,
          accuracy.providerSlug,
          accuracy.predictedPoints,
          accuracy.actualPoints,
          accuracy.signedError,
          accuracy.absoluteError,
          accuracy.squaredError,
          input.evaluatedAt,
        ],
      );
    }
  });
}

type AccuracySummaryRow = QueryResultRow & {
  position: PlayerPosition;
  horizon: string;
  source_type: "provider" | "consensus";
  provider_slug: string | null;
  sample_size: number;
  mean_absolute_error: string | number;
  root_mean_squared_error: string | number;
  mean_signed_error: string | number;
};

/** Accuracy is grouped without mutating the weights captured by old snapshots. */
export async function listProjectionAccuracySummary(input: {
  season: number;
}): Promise<ProjectionAccuracySummary[]> {
  const result = await query<AccuracySummaryRow>(
    `select accuracy.position, accuracy.horizon, accuracy.source_type,
            accuracy.provider_slug, count(*)::int as sample_size,
            avg(accuracy.absolute_error) as mean_absolute_error,
            sqrt(avg(accuracy.squared_error)) as root_mean_squared_error,
            avg(accuracy.signed_error) as mean_signed_error
       from projection_accuracy_records accuracy
       join projection_consensus_snapshots snapshot
         on snapshot.id = accuracy.consensus_snapshot_id
      where snapshot.season = $1
      group by accuracy.position, accuracy.horizon, accuracy.source_type,
               accuracy.provider_slug
      order by accuracy.horizon, accuracy.position, accuracy.source_type,
               accuracy.provider_slug nulls first`,
    [input.season],
  );
  return result.rows.map((row) => ({
    position: row.position,
    horizon: projectionHorizonSchema.parse(row.horizon),
    sourceType: row.source_type,
    providerSlug: row.provider_slug,
    sampleSize: row.sample_size,
    meanAbsoluteError: Number(row.mean_absolute_error),
    rootMeanSquaredError: Number(row.root_mean_squared_error),
    meanSignedError: Number(row.mean_signed_error),
  }));
}

export type { ProjectionConsensusComponent };
