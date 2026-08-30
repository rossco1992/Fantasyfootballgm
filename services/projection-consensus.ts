import { createHash } from "node:crypto";

import {
  getConsensusSnapshot,
  listLatestProjectionSources,
  listProjectionAccuracySummary,
  persistConsensusSnapshot,
  persistProjectionOutcomeEvaluation,
  type LatestProjectionSourceRecord,
  type PersistConsensusSnapshotInput,
  type PersistedConsensusSnapshot,
  type ProjectionAccuracySummary,
  type ProjectionOutcomeEvaluationInput,
} from "@/db/repositories/projection-consensus";
import type { LeagueConfiguration } from "@/domain/league-configuration";
import {
  CONSENSUS_CALCULATION_VERSION,
  type PlayerProjectionConsensus,
  type ProjectionHorizon,
  type ProjectionSource,
  type ProjectionWeightingConfig,
  blendProjectionSources,
  calculateFantasyPoints,
  evaluateProjectionAccuracy,
  projectionHorizonSchema,
  projectionWeightingConfigSchema,
} from "@/domain/projection-consensus";
import { retrieveLeagueConfigurationById } from "@/services/league-configurations";

export const DEFAULT_PROJECTION_WEIGHTING: ProjectionWeightingConfig = {
  version: "equal-provider-families-v1",
  providers: {
    fantasypros: {
      weight: 1,
      sourceFamily: "fantasypros",
      correlationGroup: "expert-consensus",
    },
    "fantasypros-csv": {
      weight: 1,
      sourceFamily: "fantasypros",
      correlationGroup: "expert-consensus",
    },
    fantasynerds: {
      weight: 1,
      sourceFamily: "fantasynerds",
      correlationGroup: "expert-consensus",
    },
    "fantasynerds-csv": {
      weight: 1,
      sourceFamily: "fantasynerds",
      correlationGroup: "expert-consensus",
    },
  },
};

export type ProjectionConsensusStore = {
  listSources: typeof listLatestProjectionSources;
  persistSnapshot: (
    input: PersistConsensusSnapshotInput,
  ) => Promise<PersistedConsensusSnapshot>;
  getSnapshot: typeof getConsensusSnapshot;
  persistOutcomeEvaluation: (
    input: ProjectionOutcomeEvaluationInput,
  ) => Promise<void>;
  listAccuracySummary: typeof listProjectionAccuracySummary;
};

const DEFAULT_STORE: ProjectionConsensusStore = {
  listSources: listLatestProjectionSources,
  persistSnapshot: persistConsensusSnapshot,
  getSnapshot: getConsensusSnapshot,
  persistOutcomeEvaluation: persistProjectionOutcomeEvaluation,
  listAccuracySummary: listProjectionAccuracySummary,
};

type GenerateConsensusOptions = {
  store?: ProjectionConsensusStore;
  retrieveLeague?: (
    leagueId: string,
    userId: string,
  ) => Promise<LeagueConfiguration | null>;
  clock?: () => Date;
};

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function fingerprint(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function resolvedWeightingConfig(
  input: ProjectionWeightingConfig,
  sources: LatestProjectionSourceRecord[],
): ProjectionWeightingConfig {
  const parsed = projectionWeightingConfigSchema.parse(input);
  const providers = { ...parsed.providers };
  for (const source of sources) {
    providers[source.providerSlug] ??= {
      weight: 1,
      sourceFamily: source.providerSlug,
      correlationGroup: `independent:${source.providerSlug}`,
    };
  }
  return { ...parsed, providers };
}

function projectionSource(
  record: LatestProjectionSourceRecord,
  weighting: ProjectionWeightingConfig,
): ProjectionSource {
  const configured = weighting.providers[record.providerSlug];
  if (!configured) {
    throw new Error(`Projection source ${record.providerSlug} has no weight.`);
  }
  return {
    providerId: record.providerId,
    providerSlug: record.providerSlug,
    snapshotId: record.snapshotId,
    observedAt: record.observedAt,
    projectedPoints: record.projectedPoints,
    scoring: record.scoring,
    stats: record.stats,
    weight: configured.weight,
    sourceFamily: configured.sourceFamily,
    correlationGroup: configured.correlationGroup,
  };
}

/** Keep only the freshest API/CSV delivery from the same provider family. */
function deduplicateProviderFamilies(
  sources: LatestProjectionSourceRecord[],
  weighting: ProjectionWeightingConfig,
): LatestProjectionSourceRecord[] {
  const selected = new Map<string, LatestProjectionSourceRecord>();
  for (const source of sources) {
    const family = weighting.providers[source.providerSlug]?.sourceFamily;
    if (!family) continue;
    const key = `${source.playerId}:${family}`;
    const current = selected.get(key);
    if (
      !current ||
      source.observedAt > current.observedAt ||
      (source.observedAt.valueOf() === current.observedAt.valueOf() &&
        source.providerSlug.localeCompare(current.providerSlug) < 0)
    ) {
      selected.set(key, source);
    }
  }
  return [...selected.values()];
}

function defaultHorizon(week: number | null): ProjectionHorizon {
  return week === null ? "preseason" : "weekly";
}

export async function generateProjectionConsensus(
  input: {
    leagueId: string;
    userId: string;
    season: number;
    week: number | null;
    horizon?: ProjectionHorizon;
    weightingConfig?: ProjectionWeightingConfig;
  },
  options: GenerateConsensusOptions = {},
): Promise<PersistedConsensusSnapshot> {
  const store = options.store ?? DEFAULT_STORE;
  const league = await (
    options.retrieveLeague ?? retrieveLeagueConfigurationById
  )(input.leagueId, input.userId);
  if (!league) throw new Error("League configuration was not found.");

  const horizon = projectionHorizonSchema.parse(
    input.horizon ?? defaultHorizon(input.week),
  );
  const rawSources = await store.listSources({
    season: input.season,
    week: input.week,
  });
  const weighting = resolvedWeightingConfig(
    input.weightingConfig ?? DEFAULT_PROJECTION_WEIGHTING,
    rawSources,
  );
  const selectedSources = deduplicateProviderFamilies(rawSources, weighting);

  const byPlayer = new Map<
    string,
    {
      position: LatestProjectionSourceRecord["position"];
      sources: ProjectionSource[];
    }
  >();
  for (const record of selectedSources) {
    const group = byPlayer.get(record.playerId) ?? {
      position: record.position,
      sources: [],
    };
    group.sources.push(projectionSource(record, weighting));
    byPlayer.set(record.playerId, group);
  }

  const entries: PlayerProjectionConsensus[] = [];
  for (const [playerId, group] of byPlayer) {
    const consensus = blendProjectionSources({
      playerId,
      position: group.position,
      scoring: league.scoringPreset,
      sources: group.sources,
    });
    if (consensus) entries.push(consensus);
  }
  entries.sort((left, right) => left.playerId.localeCompare(right.playerId));
  if (entries.length === 0) {
    throw new Error(
      "No usable projection records were available for this league scoring and scope.",
    );
  }

  const sourceSnapshotIds = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.components.map((component) => component.snapshotId),
      ),
    ),
  ].sort();
  const inputFingerprint = fingerprint({
    leagueId: league.id,
    season: input.season,
    week: input.week,
    horizon,
    scoring: league.scoringPreset,
    calculationVersion: CONSENSUS_CALCULATION_VERSION,
    weighting,
    entries,
  });

  return store.persistSnapshot({
    leagueConfigurationId: league.id,
    season: input.season,
    week: input.week,
    horizon,
    scoring: league.scoringPreset,
    weightingConfig: weighting,
    calculationVersion: CONSENSUS_CALCULATION_VERSION,
    sourceSnapshotIds,
    inputFingerprint,
    generatedAt: (options.clock ?? (() => new Date()))(),
    entries,
  });
}

type ProjectionOutcome = {
  playerId: string;
  stats: Record<string, number>;
  actualPoints?: number;
  source: string;
  observedAt: Date;
};

export async function evaluateProjectionConsensusSnapshot(
  input: { snapshotId: string; outcomes: ProjectionOutcome[] },
  options: Pick<GenerateConsensusOptions, "store" | "clock"> = {},
): Promise<{ evaluatedPlayers: number }> {
  const store = options.store ?? DEFAULT_STORE;
  const snapshot = await store.getSnapshot(input.snapshotId);
  if (!snapshot)
    throw new Error("Consensus projection snapshot was not found.");
  const evaluatedAt = (options.clock ?? (() => new Date()))();
  let evaluatedPlayers = 0;

  for (const outcome of input.outcomes) {
    const entry = snapshot.entries.find(
      (candidate) => candidate.playerId === outcome.playerId,
    );
    if (!entry) continue;
    const calculated = calculateFantasyPoints(outcome.stats, snapshot.scoring);
    const actualPoints = calculated?.points ?? outcome.actualPoints;
    if (actualPoints === undefined || !Number.isFinite(actualPoints)) {
      throw new Error(
        `Outcome for player ${outcome.playerId} has no scorable stat line or actual points.`,
      );
    }
    const sourceFingerprint = fingerprint({
      playerId: outcome.playerId,
      season: snapshot.season,
      week: snapshot.week,
      horizon: snapshot.horizon,
      scoring: snapshot.scoring,
      actualPoints,
      stats: outcome.stats,
      source: outcome.source,
      observedAt: outcome.observedAt,
    });
    await store.persistOutcomeEvaluation({
      consensusSnapshotId: snapshot.id,
      consensusEntryId: entry.id,
      playerId: entry.playerId,
      position: entry.position,
      season: snapshot.season,
      week: snapshot.week,
      horizon: snapshot.horizon,
      scoring: snapshot.scoring,
      actualPoints,
      stats: outcome.stats,
      source: outcome.source,
      sourceFingerprint,
      observedAt: outcome.observedAt,
      importedAt: evaluatedAt,
      evaluatedAt,
      accuracy: evaluateProjectionAccuracy(entry, actualPoints),
    });
    evaluatedPlayers += 1;
  }
  return { evaluatedPlayers };
}

export async function retrieveProjectionAccuracySummary(
  season: number,
  store: ProjectionConsensusStore = DEFAULT_STORE,
): Promise<ProjectionAccuracySummary[]> {
  return store.listAccuracySummary({ season });
}
