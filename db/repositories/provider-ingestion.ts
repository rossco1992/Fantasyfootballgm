import type { QueryResultRow } from "pg";

import { query, withTransaction } from "@/db/client";
import {
  type Player,
  type Provider,
  type ProviderDataSnapshot,
  type ProviderIngestionRun,
  type ProviderIngestionState,
  providerDataSnapshotSchema,
  providerIngestionRunSchema,
  providerIngestionStateSchema,
  playerSchema,
  providerSchema,
} from "@/db/types";
import {
  type FantasyDataType,
  type IngestionStatus,
  type JsonValue,
  type ProviderDescriptor,
  type ProviderGame,
  type ProviderIngestionRequest,
  type ProviderPlayerIdentity,
  type ProviderRecord,
  type ProviderSnapshotMetadata,
  type RejectedProviderRecord,
  providerGameCandidateSchema,
  providerDescriptorSchema,
  providerIngestionRequestSchema,
  providerPlayerIdentityCandidateSchema,
  providerSnapshotMetadataSchema,
} from "@/domain/fantasy-data";
import { matchPlayerIdentity } from "@/domain/player";

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
  playerIdentities: ProviderPlayerIdentity[];
  games: ProviderGame[];
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
  playerIdentitiesReceived: number;
  playerIdentitiesImported: number;
  gamesReceived: number;
  gamesImported: number;
  coverageGaps: string[];
};

export type FailedProviderIngestionInput = {
  runId: string;
  providerId: string;
  staleAfterSeconds: number;
  completedAt: Date;
  errorDetails: JsonValue;
  recordsReceived: number;
  playerIdentitiesReceived: number;
  gamesReceived: number;
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

export type LatestProviderGame = {
  providerId: string;
  providerSlug: string;
  snapshotId: string;
  adapterVersion: string;
  observedAt: Date;
  importedAt: Date;
  provenance: JsonValue;
  externalGameId: string;
  season: number;
  week: number;
  seasonType: "PRE" | "REG" | "POST";
  kickoffAt: Date | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  neutralSite: boolean;
  raw: JsonValue;
};

type TransactionClient = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
};

type PlayerMatchStrategy =
  | "provider_external_id"
  | "provider_alias"
  | "normalized_name_position"
  | "normalized_name_position_team"
  | "created_canonical";

type PersistedPlayerIdentity = {
  imported: number;
  unresolved: number;
};

function json(value: JsonValue): string {
  return JSON.stringify(value);
}

async function queuePlayerMatchReview(
  client: TransactionClient,
  input: {
    providerId: string;
    externalPlayerId: string;
    runId: string;
    reason: "unmatched" | "ambiguous" | "conflicting_external_ids";
    candidatePlayerIds?: string[];
    evidence: JsonValue;
  },
): Promise<void> {
  const candidatePlayerIds = [...new Set(input.candidatePlayerIds ?? [])];
  await client.query(
    `insert into player_match_reviews
      (provider_id, external_player_id, latest_ingestion_run_id, reason,
       candidate_player_ids, evidence)
     values ($1, $2, $3, $4, $5::uuid[], $6::jsonb)
     on conflict (provider_id, external_player_id) do update set
       latest_ingestion_run_id = excluded.latest_ingestion_run_id,
       reason = excluded.reason,
       status = 'open',
       candidate_player_ids = excluded.candidate_player_ids,
       evidence = excluded.evidence,
       occurrences = player_match_reviews.occurrences + 1,
       resolved_player_id = null,
       resolved_by_user_id = null,
       resolved_at = null,
       last_seen_at = now()`,
    [
      input.providerId,
      input.externalPlayerId,
      input.runId,
      input.reason,
      candidatePlayerIds,
      json(input.evidence),
    ],
  );
  await client.query(
    `insert into player_match_audit_events
      (provider_id, external_player_id, ingestion_run_id, event_type,
       strategy, candidate_player_ids, evidence)
     values ($1, $2, $3, 'queued', 'none', $4::uuid[], $5::jsonb)`,
    [
      input.providerId,
      input.externalPlayerId,
      input.runId,
      candidatePlayerIds,
      json(input.evidence),
    ],
  );
}

async function auditAutomatedPlayerMatch(
  client: TransactionClient,
  input: {
    providerId: string;
    externalPlayerId: string;
    runId: string;
    playerId: string;
    eventType: "matched" | "created";
    strategy: PlayerMatchStrategy;
    evidence: JsonValue;
  },
): Promise<void> {
  await client.query(
    `insert into player_match_audit_events
      (provider_id, external_player_id, ingestion_run_id, player_id,
       event_type, strategy, evidence)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      input.providerId,
      input.externalPlayerId,
      input.runId,
      input.playerId,
      input.eventType,
      input.strategy,
      json(input.evidence),
    ],
  );
}

async function saveRejections(
  client: TransactionClient,
  runId: string,
  rejections: RejectedProviderRecord[],
): Promise<void> {
  for (const rejection of rejections) {
    await client.query(
      `insert into provider_ingestion_rejections
        (ingestion_run_id, record_kind, record_index, raw_payload,
         validation_errors)
       values ($1, $2, $3, $4::jsonb, $5::jsonb)
       on conflict (ingestion_run_id, record_kind, record_index) do nothing`,
      [
        runId,
        rejection.kind,
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
         player_identities_received, player_identities_imported,
         games_received, games_imported,
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

async function persistPlayerIdentity(
  client: TransactionClient,
  input: {
    runId: string;
    snapshotId: string;
    providerId: string;
    descriptor: ProviderDescriptor;
    identity: ProviderPlayerIdentity;
  },
): Promise<PersistedPlayerIdentity> {
  const aliases = new Map<
    string,
    { providerSlug: string; providerName: string; externalId: string }
  >();
  for (const alias of [
    {
      providerSlug: input.descriptor.slug,
      providerName: input.descriptor.name,
      externalId: input.identity.externalPlayerId,
    },
    ...input.identity.aliases,
  ]) {
    aliases.set(`${alias.providerSlug}:${alias.externalId}`, alias);
  }

  const aliasProviders = new Map<string, string>();
  for (const alias of aliases.values()) {
    if (alias.providerSlug === input.descriptor.slug) {
      aliasProviders.set(alias.providerSlug, input.providerId);
      continue;
    }
    const providerResult = await client.query<Provider>(
      `insert into providers (slug, name)
       values ($1, $2)
       on conflict (slug) do update set name = excluded.name
       returning id, slug, name, created_at`,
      [alias.providerSlug, alias.providerName],
    );
    const provider = providerSchema.parse(providerResult.rows[0]);
    aliasProviders.set(alias.providerSlug, provider.id);
  }

  const mappedPlayerIds = new Set<string>();
  const mappedAliases: {
    alias: { providerSlug: string; providerName: string; externalId: string };
    providerId: string;
    playerId: string;
  }[] = [];
  let mappedByPrimaryProvider = false;
  for (const alias of aliases.values()) {
    const providerId = aliasProviders.get(alias.providerSlug);
    if (!providerId) throw new Error("Provider alias was not resolved.");
    const mappingResult = await client.query<{ player_id: string }>(
      `select player_id
         from player_external_ids
        where provider_id = $1 and external_id = $2`,
      [providerId, alias.externalId],
    );
    if (mappingResult.rows[0]) {
      const playerId = mappingResult.rows[0].player_id;
      mappedPlayerIds.add(playerId);
      mappedAliases.push({ alias, providerId, playerId });
      if (alias.providerSlug === input.descriptor.slug) {
        mappedByPrimaryProvider = true;
      }
    }
  }

  if (mappedPlayerIds.size > 1) {
    const candidatePlayerIds = [...mappedPlayerIds];
    const primaryMapping = mappedAliases.find(
      (mapping) => mapping.alias.providerSlug === input.descriptor.slug,
    );
    if (!primaryMapping) {
      await queuePlayerMatchReview(client, {
        providerId: input.providerId,
        externalPlayerId: input.identity.externalPlayerId,
        runId: input.runId,
        reason: "conflicting_external_ids",
        candidatePlayerIds,
        evidence: {
          sourceProvider: input.descriptor.slug,
          sourceExternalPlayerId: input.identity.externalPlayerId,
          conflictingProviders: mappedAliases.map(
            (mapping) => mapping.alias.providerSlug,
          ),
          raw: input.identity.raw,
        },
      });
    }
    const conflictingAliases = primaryMapping
      ? [
          primaryMapping,
          ...mappedAliases.filter(
            (mapping) => mapping.playerId !== primaryMapping.playerId,
          ),
        ]
      : mappedAliases;
    for (const conflict of conflictingAliases) {
      await queuePlayerMatchReview(client, {
        providerId: conflict.providerId,
        externalPlayerId: conflict.alias.externalId,
        runId: input.runId,
        reason: "conflicting_external_ids",
        candidatePlayerIds,
        evidence: {
          sourceProvider: input.descriptor.slug,
          sourceExternalPlayerId: input.identity.externalPlayerId,
          conflictingProvider: conflict.alias.providerSlug,
          conflictingExternalPlayerId: conflict.alias.externalId,
          raw: input.identity.raw,
        },
      });
    }
    return { imported: 0, unresolved: 1 };
  }

  let playerId = [...mappedPlayerIds][0];
  let createdPlayer = false;
  let strategy: PlayerMatchStrategy = mappedByPrimaryProvider
    ? "provider_external_id"
    : "provider_alias";
  if (!playerId) {
    const candidateResult = await client.query<Player>(
      `select id, full_name, position, nfl_team, bye_week, status,
              created_at, updated_at
         from players
        where position = $1`,
      [input.identity.position],
    );
    const candidates = candidateResult.rows.map((row) => {
      const candidate = playerSchema.parse(row);
      return {
        id: candidate.id,
        fullName: candidate.full_name,
        position: candidate.position,
        nflTeam: candidate.nfl_team,
        externalIds: [],
      };
    });
    const match = matchPlayerIdentity(
      {
        fullName: input.identity.fullName,
        position: input.identity.position,
        nflTeam: input.identity.nflTeam,
      },
      candidates,
    );

    if (match.kind === "ambiguous") {
      await queuePlayerMatchReview(client, {
        providerId: input.providerId,
        externalPlayerId: input.identity.externalPlayerId,
        runId: input.runId,
        reason: "ambiguous",
        candidatePlayerIds: match.candidateIds,
        evidence: input.identity.raw,
      });
      return { imported: 0, unresolved: 1 };
    }
    if (match.kind === "matched") {
      playerId = match.playerId;
      strategy = match.strategy as
        "normalized_name_position" | "normalized_name_position_team";
    }
  }

  if (!playerId) {
    const playerResult = await client.query<{ id: string }>(
      `insert into players
        (full_name, position, nfl_team, bye_week, status)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [
        input.identity.fullName,
        input.identity.position,
        input.identity.nflTeam,
        input.identity.byeWeek,
        input.identity.status,
      ],
    );
    playerId = playerResult.rows[0]?.id;
    if (!playerId) throw new Error("The canonical player was not created.");
    createdPlayer = true;
    strategy = "created_canonical";
  }

  if (!createdPlayer) {
    await client.query(
      `update players
          set full_name = $2,
              position = $3,
              nfl_team = $4,
              bye_week = coalesce($5, bye_week),
              status = $6,
              updated_at = now()
        where id = $1`,
      [
        playerId,
        input.identity.fullName,
        input.identity.position,
        input.identity.nflTeam,
        input.identity.byeWeek,
        input.identity.status,
      ],
    );
  }

  for (const alias of aliases.values()) {
    const providerId = aliasProviders.get(alias.providerSlug);
    if (!providerId) throw new Error("Provider alias was not resolved.");
    const insertedMapping: {
      rows: { player_id: string }[];
      rowCount: number | null;
    } = await client.query<{ player_id: string }>(
      `insert into player_external_ids
        (player_id, provider_id, external_id)
       values ($1, $2, $3)
       on conflict (provider_id, external_id) do nothing
       returning player_id`,
      [playerId, providerId, alias.externalId],
    );
    const assignedPlayerId: string | undefined =
      insertedMapping.rows[0]?.player_id ??
      (
        await client.query<{ player_id: string }>(
          `select player_id
             from player_external_ids
            where provider_id = $1 and external_id = $2`,
          [providerId, alias.externalId],
        )
      ).rows[0]?.player_id;
    if (assignedPlayerId !== playerId) {
      throw new Error(
        `Provider alias ${alias.providerSlug}:${alias.externalId} was assigned to a conflicting canonical player.`,
      );
    }
  }

  const { raw, ...identityPayload } = input.identity;
  identityPayload.aliases = [...aliases.values()];
  const identityResult = await client.query(
    `insert into provider_player_identity_records
      (snapshot_id, player_id, external_player_id, normalized_payload,
       raw_payload)
     values ($1, $2, $3, $4::jsonb, $5::jsonb)
     on conflict (snapshot_id, external_player_id) do nothing`,
    [
      input.snapshotId,
      playerId,
      input.identity.externalPlayerId,
      json(identityPayload as JsonValue),
      json(raw),
    ],
  );
  await auditAutomatedPlayerMatch(client, {
    providerId: input.providerId,
    externalPlayerId: input.identity.externalPlayerId,
    runId: input.runId,
    playerId,
    eventType: createdPlayer ? "created" : "matched",
    strategy,
    evidence: input.identity.raw,
  });
  return { imported: identityResult.rowCount ?? 0, unresolved: 0 };
}

export async function persistProviderSnapshot(
  input: PersistProviderSnapshotInput,
): Promise<ProviderIngestionResult> {
  const descriptor = providerDescriptorSchema.parse(input.descriptor);
  const request = providerIngestionRequestSchema.parse(input.request);
  const snapshot = providerSnapshotMetadataSchema.parse(input.snapshot);
  const playerIdentities = input.playerIdentities.map((identity) =>
    providerPlayerIdentityCandidateSchema.parse(identity),
  );
  const games = input.games.map((game) =>
    providerGameCandidateSchema.parse(game),
  );
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

    const dataRejections = input.rejections.filter(
      (rejection) => rejection.kind === "data",
    ).length;
    const identityRejections = input.rejections.filter(
      (rejection) => rejection.kind === "player_identity",
    ).length;
    const gameRejections = input.rejections.filter(
      (rejection) => rejection.kind === "game",
    ).length;
    const coverageGaps = (snapshot.provenance.coverage ?? [])
      .filter((coverage) => coverage.status === "unavailable")
      .map((coverage) => coverage.dataset);

    let playerIdentitiesImported = 0;
    let unresolvedIdentityCount = 0;
    const unresolvedIdentityExternalIds = new Set<string>();
    const unresolvedRecordExternalIds = new Set<string>();
    let recordsImported = 0;
    let gamesImported = 0;
    if (!duplicate) {
      for (const identity of playerIdentities) {
        const persistedIdentity = await persistPlayerIdentity(client, {
          runId: input.runId,
          snapshotId: persistedSnapshot.id,
          providerId: input.providerId,
          descriptor,
          identity,
        });
        playerIdentitiesImported += persistedIdentity.imported;
        unresolvedIdentityCount += persistedIdentity.unresolved;
        if (persistedIdentity.unresolved) {
          unresolvedIdentityExternalIds.add(identity.externalPlayerId);
        }
      }

      for (const record of input.records) {
        const identityIsQuarantined = unresolvedIdentityExternalIds.has(
          record.externalPlayerId,
        );
        const result = await client.query<{ player_id: string | null }>(
          `insert into provider_data_records
            (snapshot_id, player_id, external_player_id, data_type,
             record_key, normalized_payload, raw_payload)
           values (
             $1,
             case when $8::boolean then null else
               (select player_id from player_external_ids
                 where provider_id = $2 and external_id = $3 limit 1)
             end,
             $3, $4, $5, $6::jsonb, $7::jsonb
           )
           on conflict (snapshot_id, data_type, external_player_id, record_key)
           do nothing
           returning player_id`,
          [
            persistedSnapshot.id,
            input.providerId,
            record.externalPlayerId,
            record.normalized.type,
            record.recordKey,
            json(record.normalized as JsonValue),
            json(record.raw),
            identityIsQuarantined,
          ],
        );
        recordsImported += result.rowCount ?? 0;
        if (result.rows[0]?.player_id === null) {
          unresolvedRecordExternalIds.add(record.externalPlayerId);
          if (!identityIsQuarantined) {
            await queuePlayerMatchReview(client, {
              providerId: input.providerId,
              externalPlayerId: record.externalPlayerId,
              runId: input.runId,
              reason: "unmatched",
              evidence: {
                recordKey: record.recordKey,
                dataType: record.normalized.type,
                normalized: record.normalized as JsonValue,
              },
            });
          }
        }
      }

      for (const game of games) {
        const result = await client.query(
          `insert into provider_game_records
            (snapshot_id, external_game_id, season, week, season_type,
             kickoff_at, home_team, away_team, home_score, away_score,
             neutral_site, raw_payload)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
             $12::jsonb)
           on conflict (snapshot_id, external_game_id) do nothing`,
          [
            persistedSnapshot.id,
            game.externalGameId,
            game.season,
            game.week,
            game.seasonType,
            game.kickoffAt === null ? null : new Date(game.kickoffAt),
            game.homeTeam,
            game.awayTeam,
            game.homeScore,
            game.awayScore,
            game.neutralSite,
            json(game.raw),
          ],
        );
        gamesImported += result.rowCount ?? 0;
      }
    }

    await saveRejections(client, input.runId, input.rejections);

    const unmatchedResult = await client.query<{ count: number }>(
      `select count(*)::int as count
         from provider_data_records record
        where record.snapshot_id = $1
          and record.player_id is null
          and (
            record.external_player_id is null
            or not exists (
              select 1
                from player_external_ids identity
               where identity.provider_id = $2
                 and identity.external_id = record.external_player_id
            )
          )`,
      [persistedSnapshot.id, input.providerId],
    );
    let unresolvedDuplicateIdentityCount = 0;
    if (duplicate) {
      const unresolvedResult = await client.query<{ count: number }>(
        `select count(*)::int as count
           from player_match_reviews review
           join provider_ingestion_runs source_run
             on source_run.id = review.latest_ingestion_run_id
          where source_run.provider_id = $1
            and source_run.season = $2
            and source_run.week is not distinct from $3
            and review.status = 'open'`,
        [input.providerId, request.season, request.week],
      );
      unresolvedDuplicateIdentityCount = unresolvedResult.rows[0]?.count ?? 0;
    }
    const overlappingUnresolvedIds = [...unresolvedIdentityExternalIds].filter(
      (externalId) => unresolvedRecordExternalIds.has(externalId),
    ).length;
    const unmatchedPlayerCount = Math.max(
      (unmatchedResult.rows[0]?.count ?? 0) +
        unresolvedIdentityCount -
        overlappingUnresolvedIds,
      unresolvedDuplicateIdentityCount,
    );
    const status: "succeeded" | "partial" =
      input.rejections.length > 0 ||
      unmatchedPlayerCount > 0 ||
      coverageGaps.length > 0
        ? "partial"
        : "succeeded";
    const errorDetails: JsonValue | null =
      status === "partial"
        ? {
            rejectedRecords: input.rejections.length,
            unmatchedPlayerRecords: unmatchedPlayerCount,
            coverageGaps,
          }
        : null;

    const recordsReceived = input.records.length + dataRejections;
    const playerIdentitiesReceived =
      playerIdentities.length + identityRejections;
    const gamesReceived = games.length + gameRejections;

    await client.query(
      `update provider_ingestion_runs set
         status = $2,
         completed_at = $3,
         records_received = $4,
         records_imported = $5,
         records_rejected = $6,
         unmatched_player_count = $7,
         player_identities_received = $8,
         player_identities_imported = $9,
         games_received = $10,
         games_imported = $11,
         error_details = $12::jsonb
       where id = $1`,
      [
        input.runId,
        status,
        input.importedAt,
        recordsReceived,
        recordsImported,
        input.rejections.length,
        unmatchedPlayerCount,
        playerIdentitiesReceived,
        playerIdentitiesImported,
        gamesReceived,
        gamesImported,
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
      recordsReceived,
      recordsImported,
      recordsRejected: input.rejections.length,
      unmatchedPlayerCount,
      playerIdentitiesReceived,
      playerIdentitiesImported,
      gamesReceived,
      gamesImported,
      coverageGaps,
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
         player_identities_received = $4, games_received = $5,
         records_rejected = $6, error_details = $7::jsonb
       where id = $1`,
      [
        input.runId,
        input.completedAt,
        input.recordsReceived,
        input.playerIdentitiesReceived,
        input.gamesReceived,
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
      playerIdentitiesReceived: input.playerIdentitiesReceived,
      playerIdentitiesImported: 0,
      gamesReceived: input.gamesReceived,
      gamesImported: 0,
      coverageGaps: [],
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
    left join player_external_ids resolved_identity
      on resolved_identity.provider_id = s.provider_id
     and resolved_identity.external_id = r.external_player_id
   where coalesce(resolved_identity.player_id, r.player_id) = $1
     and r.data_type = $2
     and s.season = $3
     and (($4::smallint is null and s.week is null) or s.week = $4)
   order by s.provider_id, s.observed_at desc, s.imported_at desc, s.id desc
)
select
       s.provider_id, p.slug as provider_slug, s.id as snapshot_id,
       s.adapter_version, s.season, s.week, s.observed_at, s.imported_at,
       s.provenance, coalesce(resolved_identity.player_id, r.player_id) as player_id,
       r.external_player_id, r.data_type,
       r.record_key, r.normalized_payload, r.raw_payload
  from latest_snapshots latest
  join provider_data_snapshots s on s.id = latest.snapshot_id
  join provider_data_records r on r.snapshot_id = latest.snapshot_id
  join providers p on p.id = s.provider_id
  left join player_external_ids resolved_identity
    on resolved_identity.provider_id = s.provider_id
   and resolved_identity.external_id = r.external_player_id
 where coalesce(resolved_identity.player_id, r.player_id) = $1
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

export const LATEST_MARKET_TRENDS_SQL = `with latest_snapshots as (
  select distinct on (s.provider_id)
         s.provider_id, s.id as snapshot_id
    from provider_data_snapshots s
    join provider_data_records r on r.snapshot_id = s.id
    left join player_external_ids resolved_identity
      on resolved_identity.provider_id = s.provider_id
     and resolved_identity.external_id = r.external_player_id
   where r.data_type = 'market_trend'
     and coalesce(resolved_identity.player_id, r.player_id) is not null
     and s.season = $1
     and (($2::smallint is null and s.week is null) or s.week = $2)
   order by s.provider_id, s.observed_at desc, s.imported_at desc, s.id desc
)
select
       s.provider_id, p.slug as provider_slug, s.id as snapshot_id,
       s.adapter_version, s.season, s.week, s.observed_at, s.imported_at,
       s.provenance, coalesce(resolved_identity.player_id, r.player_id) as player_id,
       r.external_player_id, r.data_type,
       r.record_key, r.normalized_payload, r.raw_payload
  from latest_snapshots latest
  join provider_data_snapshots s on s.id = latest.snapshot_id
  join provider_data_records r on r.snapshot_id = latest.snapshot_id
  join providers p on p.id = s.provider_id
  left join player_external_ids resolved_identity
    on resolved_identity.provider_id = s.provider_id
   and resolved_identity.external_id = r.external_player_id
 where r.data_type = 'market_trend'
   and coalesce(resolved_identity.player_id, r.player_id) is not null
 order by p.slug, r.external_player_id, r.record_key`;

/** Market popularity stays separately queryable from projections/rankings. */
export async function listLatestMarketTrends(input: {
  season: number;
  week: number | null;
}): Promise<LatestProviderDataRecord[]> {
  const result = await query<LatestProviderDataRow>(LATEST_MARKET_TRENDS_SQL, [
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

type LatestProviderGameRow = QueryResultRow & {
  provider_id: string;
  provider_slug: string;
  snapshot_id: string;
  adapter_version: string;
  observed_at: Date;
  imported_at: Date;
  provenance: JsonValue;
  external_game_id: string;
  season: number;
  week: number;
  season_type: "PRE" | "REG" | "POST";
  kickoff_at: Date | null;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  neutral_site: boolean;
  raw_payload: JsonValue;
};

export const LATEST_GAMES_SQL = `with latest_snapshots as (
  select distinct on (s.provider_id)
         s.provider_id, s.id as snapshot_id
    from provider_data_snapshots s
    join provider_game_records g on g.snapshot_id = s.id
   where g.season = $1 and g.week = $2
   order by s.provider_id, s.observed_at desc, s.imported_at desc, s.id desc
)
select
       s.provider_id, p.slug as provider_slug, s.id as snapshot_id,
       s.adapter_version, s.observed_at, s.imported_at, s.provenance,
       g.external_game_id, g.season, g.week, g.season_type, g.kickoff_at,
       g.home_team, g.away_team, g.home_score, g.away_score,
       g.neutral_site, g.raw_payload
  from latest_snapshots latest
  join provider_data_snapshots s on s.id = latest.snapshot_id
  join provider_game_records g on g.snapshot_id = latest.snapshot_id
  join providers p on p.id = s.provider_id
 where g.season = $1 and g.week = $2
 order by g.kickoff_at nulls last, g.external_game_id`;

/** Games from the freshest immutable schedule snapshot for a season/week. */
export async function listLatestGames(input: {
  season: number;
  week: number;
}): Promise<LatestProviderGame[]> {
  const result = await query<LatestProviderGameRow>(LATEST_GAMES_SQL, [
    input.season,
    input.week,
  ]);

  return result.rows.map((row) => ({
    providerId: row.provider_id,
    providerSlug: row.provider_slug,
    snapshotId: row.snapshot_id,
    adapterVersion: row.adapter_version,
    observedAt: row.observed_at,
    importedAt: row.imported_at,
    provenance: row.provenance,
    externalGameId: row.external_game_id,
    season: row.season,
    week: row.week,
    seasonType: row.season_type,
    kickoffAt: row.kickoff_at,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeScore: row.home_score,
    awayScore: row.away_score,
    neutralSite: row.neutral_site,
    raw: row.raw_payload,
  }));
}
