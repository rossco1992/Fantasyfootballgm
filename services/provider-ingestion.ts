import { createHash } from "node:crypto";

import {
  failProviderIngestionRun,
  getProviderIngestionHealth,
  persistProviderSnapshot,
  startProviderIngestionRun,
  type FailedProviderIngestionInput,
  type PersistProviderSnapshotInput,
  type ProviderIngestionHealth,
  type ProviderIngestionResult,
  type StartedProviderIngestionRun,
} from "@/db/repositories/provider-ingestion";
import {
  type JsonValue,
  type ProviderDescriptor,
  type ProviderGame,
  type ProviderIngestionRequest,
  type ProviderPlayerIdentity,
  type ProviderRecord,
  type ProviderSnapshotCandidate,
  type ProviderSnapshotMetadata,
  type RejectedProviderRecord,
  jsonValueSchema,
  providerGameCandidateSchema,
  providerDescriptorSchema,
  providerIngestionRequestSchema,
  providerPlayerIdentityCandidateSchema,
  providerRecordCandidateSchema,
  providerSnapshotMetadataSchema,
} from "@/domain/fantasy-data";
import type { FantasyDataProviderAdapter } from "@/providers/types";

export interface ProviderIngestionStore {
  startRun(
    descriptor: ProviderDescriptor,
    request: ProviderIngestionRequest,
    startedAt: Date,
  ): Promise<StartedProviderIngestionRun>;
  persistSnapshot(
    input: PersistProviderSnapshotInput,
  ): Promise<ProviderIngestionResult>;
  failRun(
    input: FailedProviderIngestionInput,
  ): Promise<ProviderIngestionResult>;
  getHealth(providerSlug: string): Promise<ProviderIngestionHealth | null>;
}

export const sqlProviderIngestionStore: ProviderIngestionStore = {
  startRun: startProviderIngestionRun,
  persistSnapshot: persistProviderSnapshot,
  failRun: failProviderIngestionRun,
  getHealth: getProviderIngestionHealth,
};

export type ProviderIngestionOutcome = ProviderIngestionResult & {
  error: JsonValue | null;
};

export type ProviderFreshness = ProviderIngestionHealth & {
  isStale: boolean;
};

export type IngestionOptions = {
  store?: ProviderIngestionStore;
  clock?: () => Date;
};

function toJsonValue(value: unknown): JsonValue {
  const direct = jsonValueSchema.safeParse(value);
  if (direct.success) return direct.data;

  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) {
      const parsed = jsonValueSchema.safeParse(JSON.parse(serialized));
      if (parsed.success) return parsed.data;
    }
  } catch {
    // Fall through to a stable diagnostic string for cyclic/non-JSON values.
  }
  return String(value);
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
    .join(",")}}`;
}

function fingerprintSnapshot(
  descriptor: ProviderDescriptor,
  candidate: ProviderSnapshotCandidate,
): string {
  return createHash("sha256")
    .update(
      canonicalJson(
        toJsonValue({
          provider: descriptor.slug,
          adapterVersion: descriptor.adapterVersion,
          candidate: toJsonValue(candidate),
        }),
      ),
    )
    .digest("hex");
}

function issuesToJson(
  issues: { path: PropertyKey[]; message: string }[],
): JsonValue {
  return issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

function errorToJson(kind: string, error: unknown): JsonValue {
  return {
    kind,
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  };
}

async function fail(
  store: ProviderIngestionStore,
  started: StartedProviderIngestionRun,
  descriptor: ProviderDescriptor,
  completedAt: Date,
  errorDetails: JsonValue,
  recordsReceived = 0,
  rejections: RejectedProviderRecord[] = [],
  playerIdentitiesReceived = 0,
  gamesReceived = 0,
): Promise<ProviderIngestionOutcome> {
  const result = await store.failRun({
    runId: started.id,
    providerId: started.providerId,
    staleAfterSeconds: descriptor.staleAfterSeconds,
    completedAt,
    errorDetails,
    recordsReceived,
    playerIdentitiesReceived,
    gamesReceived,
    rejections,
  });
  return { ...result, error: errorDetails };
}

/**
 * Run one provider ingestion attempt. The same function backs scheduled and
 * on-demand entry points so validation, idempotency, and failure behavior stay
 * identical.
 */
export async function ingestProviderData<TRawPayload>(
  adapter: FantasyDataProviderAdapter<TRawPayload>,
  requestInput: ProviderIngestionRequest,
  options: IngestionOptions = {},
): Promise<ProviderIngestionOutcome> {
  const store = options.store ?? sqlProviderIngestionStore;
  const clock = options.clock ?? (() => new Date());
  const descriptor = providerDescriptorSchema.parse(adapter.descriptor);
  const request = providerIngestionRequestSchema.parse(requestInput);
  const started = await store.startRun(descriptor, request, clock());

  let candidate: ProviderSnapshotCandidate;
  try {
    const payload = await adapter.fetch(request);
    candidate = adapter.normalize(payload, request);
  } catch (error) {
    return fail(
      store,
      started,
      descriptor,
      clock(),
      errorToJson("adapter_error", error),
    );
  }

  const candidateRecords =
    typeof candidate === "object" &&
    candidate !== null &&
    "records" in candidate
      ? candidate.records
      : undefined;
  const candidatePlayers =
    typeof candidate === "object" &&
    candidate !== null &&
    "players" in candidate
      ? candidate.players
      : [];
  const candidateGames =
    typeof candidate === "object" && candidate !== null && "games" in candidate
      ? candidate.games
      : [];

  const recordsReceived = Array.isArray(candidateRecords)
    ? candidateRecords.length
    : 0;
  const playerIdentitiesReceived = Array.isArray(candidatePlayers)
    ? candidatePlayers.length
    : 0;
  const gamesReceived = Array.isArray(candidateGames)
    ? candidateGames.length
    : 0;

  const metadataResult = providerSnapshotMetadataSchema.safeParse(candidate);
  if (!metadataResult.success) {
    return fail(
      store,
      started,
      descriptor,
      clock(),
      {
        kind: "snapshot_validation_error",
        issues: issuesToJson(metadataResult.error.issues),
      },
      recordsReceived,
      [],
      playerIdentitiesReceived,
      gamesReceived,
    );
  }

  const metadata: ProviderSnapshotMetadata = metadataResult.data;
  if (metadata.season !== request.season || metadata.week !== request.week) {
    return fail(
      store,
      started,
      descriptor,
      clock(),
      {
        kind: "request_snapshot_mismatch",
        requested: { season: request.season, week: request.week },
        received: { season: metadata.season, week: metadata.week },
      },
      recordsReceived,
      [],
      playerIdentitiesReceived,
      gamesReceived,
    );
  }

  if (
    !Array.isArray(candidateRecords) ||
    !Array.isArray(candidatePlayers) ||
    !Array.isArray(candidateGames)
  ) {
    return fail(
      store,
      started,
      descriptor,
      clock(),
      {
        kind: "snapshot_validation_error",
        message:
          "Adapter output must contain a records array; players and games must be arrays when provided.",
      },
      recordsReceived,
      [],
      playerIdentitiesReceived,
      gamesReceived,
    );
  }

  const records: ProviderRecord[] = [];
  const playerIdentities: ProviderPlayerIdentity[] = [];
  const games: ProviderGame[] = [];
  const rejections: RejectedProviderRecord[] = [];
  const recordIdentities = new Set<string>();

  candidateRecords.forEach((candidateRecord, recordIndex) => {
    const parsed = providerRecordCandidateSchema.safeParse(candidateRecord);
    if (!parsed.success) {
      rejections.push({
        kind: "data",
        recordIndex,
        rawPayload: toJsonValue(candidateRecord),
        validationErrors: issuesToJson(parsed.error.issues),
      });
      return;
    }

    const identity = [
      parsed.data.externalPlayerId,
      parsed.data.normalized.type,
      parsed.data.recordKey,
    ].join(":");
    if (recordIdentities.has(identity)) {
      rejections.push({
        kind: "data",
        recordIndex,
        rawPayload: parsed.data.raw,
        validationErrors: [
          {
            path: "recordKey",
            message: "Duplicate provider record identity within one snapshot.",
          },
        ],
      });
      return;
    }
    recordIdentities.add(identity);
    records.push(parsed.data);
  });

  const playerIdentityKeys = new Set<string>();
  candidatePlayers.forEach((candidatePlayer, recordIndex) => {
    const parsed =
      providerPlayerIdentityCandidateSchema.safeParse(candidatePlayer);
    if (!parsed.success) {
      rejections.push({
        kind: "player_identity",
        recordIndex,
        rawPayload: toJsonValue(candidatePlayer),
        validationErrors: issuesToJson(parsed.error.issues),
      });
      return;
    }
    if (playerIdentityKeys.has(parsed.data.externalPlayerId)) {
      rejections.push({
        kind: "player_identity",
        recordIndex,
        rawPayload: parsed.data.raw,
        validationErrors: [
          {
            path: "externalPlayerId",
            message: "Duplicate provider player identity within one snapshot.",
          },
        ],
      });
      return;
    }
    playerIdentityKeys.add(parsed.data.externalPlayerId);
    playerIdentities.push(parsed.data);
  });

  const gameKeys = new Set<string>();
  candidateGames.forEach((candidateGame, recordIndex) => {
    const parsed = providerGameCandidateSchema.safeParse(candidateGame);
    if (!parsed.success) {
      rejections.push({
        kind: "game",
        recordIndex,
        rawPayload: toJsonValue(candidateGame),
        validationErrors: issuesToJson(parsed.error.issues),
      });
      return;
    }
    if (
      parsed.data.season !== request.season ||
      (request.week !== null && parsed.data.week !== request.week)
    ) {
      rejections.push({
        kind: "game",
        recordIndex,
        rawPayload: parsed.data.raw,
        validationErrors: [
          {
            path: "season/week",
            message: "Game scope does not match the ingestion request.",
          },
        ],
      });
      return;
    }
    if (gameKeys.has(parsed.data.externalGameId)) {
      rejections.push({
        kind: "game",
        recordIndex,
        rawPayload: parsed.data.raw,
        validationErrors: [
          {
            path: "externalGameId",
            message: "Duplicate provider game within one snapshot.",
          },
        ],
      });
      return;
    }
    gameKeys.add(parsed.data.externalGameId);
    games.push(parsed.data);
  });

  if (
    records.length + playerIdentities.length + games.length === 0 &&
    rejections.length > 0
  ) {
    return fail(
      store,
      started,
      descriptor,
      clock(),
      {
        kind: "all_records_rejected",
        rejectedRecords: rejections.length,
      },
      candidateRecords.length,
      rejections,
      candidatePlayers.length,
      candidateGames.length,
    );
  }

  let result: ProviderIngestionResult;
  try {
    result = await store.persistSnapshot({
      runId: started.id,
      providerId: started.providerId,
      descriptor,
      request,
      snapshot: metadata,
      sourceFingerprint: fingerprintSnapshot(descriptor, candidate),
      records,
      playerIdentities,
      games,
      rejections,
      importedAt: clock(),
    });
  } catch (error) {
    return fail(
      store,
      started,
      descriptor,
      clock(),
      errorToJson("persistence_error", error),
      candidateRecords.length,
      rejections,
      candidatePlayers.length,
      candidateGames.length,
    );
  }

  return {
    ...result,
    error:
      result.status === "partial"
        ? {
            kind: "partial_import",
            rejectedRecords: result.recordsRejected,
            unmatchedPlayerRecords: result.unmatchedPlayerCount,
            coverageGaps: result.coverageGaps,
          }
        : null,
  };
}

export function runScheduledProviderIngestion<TRawPayload>(
  adapter: FantasyDataProviderAdapter<TRawPayload>,
  scope: Omit<ProviderIngestionRequest, "trigger">,
  options?: IngestionOptions,
): Promise<ProviderIngestionOutcome> {
  return ingestProviderData(
    adapter,
    { ...scope, trigger: "scheduled" },
    options,
  );
}

export function runOnDemandProviderIngestion<TRawPayload>(
  adapter: FantasyDataProviderAdapter<TRawPayload>,
  scope: Omit<ProviderIngestionRequest, "trigger">,
  options?: IngestionOptions,
): Promise<ProviderIngestionOutcome> {
  return ingestProviderData(
    adapter,
    { ...scope, trigger: "on_demand" },
    options,
  );
}

export async function retrieveProviderFreshness(
  providerSlug: string,
  options: Pick<IngestionOptions, "store" | "clock"> = {},
): Promise<ProviderFreshness | null> {
  const store = options.store ?? sqlProviderIngestionStore;
  const health = await store.getHealth(providerSlug);
  if (!health) return null;
  const now = (options.clock ?? (() => new Date()))();
  const isStale =
    health.lastSuccessAt === null ||
    now.getTime() - health.lastSuccessAt.getTime() >
      health.staleAfterSeconds * 1_000;
  return { ...health, isStale };
}
