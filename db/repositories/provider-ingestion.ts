import type { QueryResultRow } from "pg";

import { query, withTransaction } from "@/db/client";
import {
  type Provider,
  type ProviderDataSnapshot,
  type ProviderIngestionRun,
  type ProviderIngestionState,
  providerDataSnapshotSchema,
  providerIngestionRunSchema,
  providerIngestionStateSchema,
  providerSchema,
} from "@/db/types";
import {
  type FantasyDataType,
  type IngestionStatus,
  type JsonValue,
  type ProviderDescriptor,
  type ProviderIngestionRequest,
  type ProviderRecord,
  type ProviderSnapshotMetadata,
  type RejectedProviderRecord,
  providerDescriptorSchema,
  providerIngestionRequestSchema,
  providerSnapshotMetadataSchema,
} from "@/domain/fantasy-data";

export type StartedProviderIngestionRun = {
  id: string;
  providerId: string;
};

export type PersistProviderSnapshotInput = {
  runId: string;
  providerId: string;
  descriptor: ProviderDescriptor;
  request: ProviderIngestionRequest;
  snapshot: ProviderSnapshotMetadata;
  sourceFingerprint: string;
  records: ProviderRecord[];
  rejections: RejectedProviderRecord[];
  importedAt: Date;
};

export type ProviderIngestionResult = {
  runId: string;
  snapshotId: string | null;
  status: Exclude<IngestionStatus, "running">;
  duplicate: boolean;
  recordsReceived: number;
  recordsImported: number;
  recordsRejected: number;
  unmatchedPlayerCount: number;
};

export type FailedProviderIngestionInput = {
  runId: string;
  providerId: string;
  staleAfterSeconds: number;
  completedAt: Date;
  errorDetails: JsonValue;
  recordsReceived: number;
  rejections: RejectedProviderRecord[];
};

export type ProviderIngestionHealth = {
  providerId: string;
  providerSlug: string;
  lastAttemptAt: Date;
  lastSuccessAt: Date | null;
  latestSnapshotId: string | null;
  lastStatus: IngestionStatus;
  staleAfterSeconds: number;
  consecutiveFailures: number;
  lastError: JsonValue | null;
  updatedAt: Date;
};

export type LatestProviderDataRecord = {
  providerId: string;
  providerSlug: string;
  snapshotId: string;
  adapterVersion: string;
  season: number;
  week: number | null;
  observedAt: Date;
  importedAt: Date;
  provenance: JsonValue;
  playerId: string;
  externalPlayerId: string;
  dataType: FantasyDataType;
  recordKey: string;
  normalized: JsonValue;
  raw: JsonValue;
};

type TransactionClient = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
};

function json(value: JsonValue): string {
  return JSON.stringify(value);
}

async function saveRejections(
  client: TransactionClient,
  runId: string,
  rejections: RejectedProviderRecord[],
): Promise<void> {
  for (const rejection of rejections) {
    await client.query(
      `insert into provider_ingestion_rejections
        (ingestion_run_id, record_index, raw_payload, validation_errors)
       values ($1, $2, $3::jsonb, $4::jsonb)
       on conflict (ingestion_run_id, record_index) do nothing`,
      [
        runId,
        rejection.recordIndex,
        json(rejection.rawPayload),
        json(rejection.validationErrors),
      ],
    );
  }
}

export async function startProviderIngestionRun(
  descriptorInput: ProviderDescriptor,
  requestInput: ProviderIngestionRequest,
  startedAt: Date,
): Promise<StartedProviderIngestionRun> {
  const descriptor = providerDescriptorSchema.parse(descriptorInput);
  const request = providerIngestionRequestSchema.parse(requestInput);

  return withTransaction(async (client) => {
    const providerResult = await client.query<Provider>(
      `insert into providers (slug, name)
       values ($1, $2)
       on conflict (slug) do update set name = excluded.name
       returning id, slug, name, created_at`,
      [descriptor.slug, descriptor.name],
    );
    const provider = providerSchema.parse(providerResult.rows[0]);

    const runResult = await client.query<ProviderIngestionRun>(
      `insert into provider_ingestion_runs
        (provider_id, trigger_type, status, adapter_version, season, week, started_at)
       values ($1, $2, 'running', $3, $4, $5, $6)
       returning id, provider_id, trigger_type, status, adapter_version,
         season, week, started_at, completed_at, records_received,
         records_imported, records_rejected, unmatched_player_count,
         error_details, created_at`,
      [
        provider.id,
        request.trigger,
        descriptor.adapterVersion,
        request.season,
        request.week,
        startedAt,
      ],
    );
    const run = providerIngestionRunSchema.parse(runResult.rows[0]);

    await client.query(
      `insert into provider_ingestion_state
        (provider_id, last_attempt_at, last_status, stale_after_seconds,
         consecutive_failures, updated_at)
       values ($1, $2, 'running', $3, 0, $2)
       on conflict (provider_id) do update set
         last_attempt_at = excluded.last_attempt_at,
         last_status = 'running',
         stale_after_seconds = excluded.stale_after_seconds,
         updated_at = excluded.updated_at`,
      [provider.id, startedAt, descriptor.staleAfterSeconds],
    );

    return { id: run.id, providerId: provider.id };
  });
}

export async function persistProviderSnapshot(
  input: PersistProviderSnapshotInput,
): Promise<ProviderIngestionResult> {
  const descriptor = providerDescriptorSchema.parse(input.descriptor);
  const request = providerIngestionRequestSchema.parse(input.request);
  const snapshot = providerSnapshotMetadataSchema.parse(input.snapshot);
  if (snapshot.season !== request.season || snapshot.week !== request.week) {
    throw new Error(
      "Provider snapshot scope does not match the ingestion run.",
    );
  }
  if (!/^[a-f0-9]{64}$/.test(input.sourceFingerprint)) {
    throw new Error(
      "Provider snapshot fingerprint must be a SHA-256 hex digest.",
    );
  }

  return withTransaction(async (client) => {
    const snapshotResult = await client.query<ProviderDataSnapshot>(
      `insert into provider_data_snapshots
        (provider_id, ingestion_run_id, source_fingerprint, adapter_version,
         season, week, observed_at, imported_at, provenance)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       on conflict (provider_id, source_fingerprint) do nothing
       returning id, provider_id, ingestion_run_id, source_fingerprint,
         adapter_version, season, week, observed_at, imported_at, provenance,
         created_at`,
      [
        input.providerId,
        input.runId,
        input.sourceFingerprint,
        descriptor.adapterVersion,
        snapshot.season,
        snapshot.week,
        new Date(snapshot.observedAt),
        input.importedAt,
        json(snapshot.provenance),
      ],
    );

    let persistedSnapshot: ProviderDataSnapshot;
    let duplicate = false;
    if (snapshotResult.rows[0]) {
      persistedSnapshot = providerDataSnapshotSchema.parse(
        snapshotResult.rows[0],
      );
    } else {
      duplicate = true;
      const existingResult = await client.query<ProviderDataSnapshot>(
        `select id, provider_id, ingestion_run_id, source_fingerprint,
                adapter_version, season, week, observed_at, imported_at,
                provenance, created_at
           from provider_data_snapshots
          where provider_id = $1 and source_fingerprint = $2`,
        [input.providerId, input.sourceFingerprint],
      );
      persistedSnapshot = providerDataSnapshotSchema.parse(
        existingResult.rows[0],
      );
    }

    let recordsImported = 0;
    if (!duplicate) {
      for (const record of input.records) {
        const result = await client.query(
          `insert into provider_data_records
            (snapshot_id, player_id, external_player_id, data_type,
             record_key, normalized_payload, raw_payload)
           values (
             $1,
             (select player_id from player_external_ids
               where provider_id = $2 and external_id = $3 limit 1),
             $3, $4, $5, $6::jsonb, $7::jsonb
           )
           on conflict (snapshot_id, data_type, external_player_id, record_key)
           do nothing`,
          [
            persistedSnapshot.id,
            input.providerId,
            record.externalPlayerId,
            record.normalized.type,
            record.recordKey,
            json(record.normalized as JsonValue),
            json(record.raw),
          ],
        );
        recordsImported += result.rowCount ?? 0;
      }
    }

    await saveRejections(client, input.runId, input.rejections);

    const unmatchedResult = await client.query<{ count: number }>(
      `select count(*)::int as count
         from provider_data_records
        where snapshot_id = $1 and player_id is null`,
      [persistedSnapshot.id],
    );
    const unmatchedPlayerCount = unmatchedResult.rows[0]?.count ?? 0;
    const status: "succeeded" | "partial" =
      input.rejections.length > 0 || unmatchedPlayerCount > 0
        ? "partial"
        : "succeeded";
    const errorDetails: JsonValue | null =
      status === "partial"
        ? {
            rejectedRecords: input.rejections.length,
            unmatchedPlayerRecords: unmatchedPlayerCount,
          }
        : null;

    await client.query(
      `update provider_ingestion_runs set
         status = $2,
         completed_at = $3,
         records_received = $4,
         records_imported = $5,
         records_rejected = $6,
         unmatched_player_count = $7,
         error_details = $8::jsonb
       where id = $1`,
      [
        input.runId,
        status,
        input.importedAt,
        input.records.length + input.rejections.length,
        recordsImported,
        input.rejections.length,
        unmatchedPlayerCount,
        errorDetails === null ? null : json(errorDetails),
      ],
    );

    await client.query(
      `insert into provider_ingestion_state
        (provider_id, last_attempt_at, last_success_at, latest_snapshot_id,
         last_status, stale_after_seconds, consecutive_failures, last_error,
         updated_at)
       values ($1, $2, $2, $3, $4, $5, 0, $6::jsonb, $2)
       on conflict (provider_id) do update set
         last_attempt_at = excluded.last_attempt_at,
         last_success_at = excluded.last_success_at,
         latest_snapshot_id = excluded.latest_snapshot_id,
         last_status = excluded.last_status,
         stale_after_seconds = excluded.stale_after_seconds,
         consecutive_failures = 0,
         last_error = excluded.last_error,
         updated_at = excluded.updated_at`,
      [
        input.providerId,
        input.importedAt,
        persistedSnapshot.id,
        status,
        descriptor.staleAfterSeconds,
        errorDetails === null ? null : json(errorDetails),
      ],
    );

    return {
      runId: input.runId,
      snapshotId: persistedSnapshot.id,
      status,
      duplicate,
      recordsReceived: input.records.length + input.rejections.length,
      recordsImported,
      recordsRejected: input.rejections.length,
      unmatchedPlayerCount,
    };
  });
}

export async function failProviderIngestionRun(
  input: FailedProviderIngestionInput,
): Promise<ProviderIngestionResult> {
  return withTransaction(async (client) => {
    await saveRejections(client, input.runId, input.rejections);
    await client.query(
      `update provider_ingestion_runs set
         status = 'failed', completed_at = $2, records_received = $3,
         records_rejected = $4, error_details = $5::jsonb
       where id = $1`,
      [
        input.runId,
        input.completedAt,
        input.recordsReceived,
        input.rejections.length,
        json(input.errorDetails),
      ],
    );
    await client.query(
      `insert into provider_ingestion_state
        (provider_id, last_attempt_at, last_status, stale_after_seconds,
         consecutive_failures, last_error, updated_at)
       values ($1, $2, 'failed', $3, 1, $4::jsonb, $2)
       on conflict (provider_id) do update set
         last_attempt_at = excluded.last_attempt_at,
         last_status = 'failed',
         stale_after_seconds = excluded.stale_after_seconds,
         consecutive_failures = provider_ingestion_state.consecutive_failures + 1,
         last_error = excluded.last_error,
         updated_at = excluded.updated_at`,
      [
        input.providerId,
        input.completedAt,
        input.staleAfterSeconds,
        json(input.errorDetails),
      ],
    );

    return {
      runId: input.runId,
      snapshotId: null,
      status: "failed",
      duplicate: false,
      recordsReceived: input.recordsReceived,
      recordsImported: 0,
      recordsRejected: input.rejections.length,
      unmatchedPlayerCount: 0,
    };
  });
}

export async function getProviderIngestionHealth(
  providerSlug: string,
): Promise<ProviderIngestionHealth | null> {
  const result = await query<
    ProviderIngestionState & { provider_slug: string }
  >(
    `select s.provider_id, p.slug as provider_slug, s.last_attempt_at,
            s.last_success_at, s.latest_snapshot_id, s.last_status,
            s.stale_after_seconds, s.consecutive_failures, s.last_error,
            s.updated_at
       from provider_ingestion_state s
       join providers p on p.id = s.provider_id
      where p.slug = $1`,
    [providerSlug],
  );
  const row = result.rows[0];
  if (!row) return null;
  const state = providerIngestionStateSchema.parse(row);
  return {
    providerId: state.provider_id,
    providerSlug: row.provider_slug,
    lastAttemptAt: state.last_attempt_at,
    lastSuccessAt: state.last_success_at,
    latestSnapshotId: state.latest_snapshot_id,
    lastStatus: state.last_status,
    staleAfterSeconds: state.stale_after_seconds,
    consecutiveFailures: state.consecutive_failures,
    lastError: state.last_error,
    updatedAt: state.updated_at,
  };
}

type LatestProviderDataRow = QueryResultRow & {
  provider_id: string;
  provider_slug: string;
  snapshot_id: string;
  adapter_version: string;
  season: number;
  week: number | null;
  observed_at: Date;
  imported_at: Date;
  provenance: JsonValue;
  player_id: string;
  external_player_id: string;
  data_type: FantasyDataType;
  record_key: string;
  normalized_payload: JsonValue;
  raw_payload: JsonValue;
};

export const LATEST_PLAYER_DATA_SQL = `with latest_snapshots as (
  select distinct on (s.provider_id)
         s.provider_id, s.id as snapshot_id
    from provider_data_snapshots s
    join provider_data_records r on r.snapshot_id = s.id
   where r.player_id = $1
     and r.data_type = $2
     and s.season = $3
     and (($4::smallint is null and s.week is null) or s.week = $4)
   order by s.provider_id, s.observed_at desc, s.imported_at desc, s.id desc
)
select
       s.provider_id, p.slug as provider_slug, s.id as snapshot_id,
       s.adapter_version, s.season, s.week, s.observed_at, s.imported_at,
       s.provenance, r.player_id, r.external_player_id, r.data_type,
       r.record_key, r.normalized_payload, r.raw_payload
  from latest_snapshots latest
  join provider_data_snapshots s on s.id = latest.snapshot_id
  join provider_data_records r on r.snapshot_id = latest.snapshot_id
  join providers p on p.id = s.provider_id
 where r.player_id = $1
   and r.data_type = $2
 order by p.slug, r.record_key`;

/** All matching records from the freshest applicable snapshot per provider. */
export async function listLatestPlayerData(input: {
  playerId: string;
  dataType: FantasyDataType;
  season: number;
  week: number | null;
}): Promise<LatestProviderDataRecord[]> {
  const result = await query<LatestProviderDataRow>(LATEST_PLAYER_DATA_SQL, [
    input.playerId,
    input.dataType,
    input.season,
    input.week,
  ]);

  return result.rows.map((row) => ({
    providerId: row.provider_id,
    providerSlug: row.provider_slug,
    snapshotId: row.snapshot_id,
    adapterVersion: row.adapter_version,
    season: row.season,
    week: row.week,
    observedAt: row.observed_at,
    importedAt: row.imported_at,
    provenance: row.provenance,
    playerId: row.player_id,
    externalPlayerId: row.external_player_id,
    dataType: row.data_type,
    recordKey: row.record_key,
    normalized: row.normalized_payload,
    raw: row.raw_payload,
  }));
}
