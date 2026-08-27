import {
  hasCompletedHistoricalScope,
  listHistoricalBackfillScopes,
  type HistoricalBackfillScope,
} from "@/db/repositories/historical-backfill";
import { withProviderRefreshLock } from "@/db/repositories/provider-refresh-lock";
import {
  NFLVERSE_FIRST_SUPPORTED_SEASON,
  NFLVERSE_LAST_REGULAR_SEASON_WEEK,
  type HistoricalBackfillRange,
  latestCompletedNFLSeason,
  validateHistoricalBackfillRange,
  weeksInRange,
} from "@/domain/historical-backfill";
import {
  NFLVERSE_PROVIDER_DESCRIPTOR,
  NflverseProviderAdapter,
  type NflversePayload,
} from "@/providers/nflverse/nflverse-provider-adapter";
import type { FantasyDataProviderAdapter } from "@/providers/types";
import {
  type IngestionOptions,
  type ProviderIngestionOutcome,
  runOnDemandProviderIngestion,
  runScheduledProviderIngestion,
} from "@/services/provider-ingestion";

export type HistoricalBackfillScopeResult =
  | { season: number; week: number; kind: "skipped" }
  | {
      season: number;
      week: number;
      kind: "attempted";
      outcome: ProviderIngestionOutcome;
    };

export type HistoricalBackfillResult = {
  status: "succeeded" | "partial" | "failed";
  scopes: HistoricalBackfillScopeResult[];
  skipped: number;
  succeeded: number;
  partial: number;
  failed: number;
};

type HistoricalBackfillOptions = IngestionOptions & {
  adapter?: FantasyDataProviderAdapter<NflversePayload>;
  isComplete?: typeof hasCompletedHistoricalScope;
  lock?: typeof withProviderRefreshLock;
  latestSeason?: number;
  maxWeeks?: number;
};

export async function backfillNflverseHistory(
  input: HistoricalBackfillRange,
  trigger: "on_demand" | "scheduled",
  options: HistoricalBackfillOptions = {},
): Promise<HistoricalBackfillResult> {
  const range = validateHistoricalBackfillRange(input, {
    latestSeason: options.latestSeason,
    maxWeeks: options.maxWeeks,
  });
  const adapter = options.adapter ?? new NflverseProviderAdapter();
  const isComplete = options.isComplete ?? hasCompletedHistoricalScope;
  const lock = options.lock ?? withProviderRefreshLock;
  const run =
    trigger === "scheduled"
      ? runScheduledProviderIngestion
      : runOnDemandProviderIngestion;
  const scopes: HistoricalBackfillScopeResult[] = [];

  for (const week of weeksInRange(range)) {
    const scope = { season: range.season, week };
    const result = await lock(
      NFLVERSE_PROVIDER_DESCRIPTOR.slug,
      async (): Promise<HistoricalBackfillScopeResult> => {
        if (
          !range.force &&
          (await isComplete(
            NFLVERSE_PROVIDER_DESCRIPTOR.slug,
            range.season,
            week,
          ))
        ) {
          return { ...scope, kind: "skipped" };
        }
        const outcome = await run(adapter, scope, {
          store: options.store,
          clock: options.clock,
          updateCanonicalPlayerMetadata: false,
        });
        return { ...scope, kind: "attempted", outcome };
      },
    );
    scopes.push(result);
  }

  const attempted = scopes.filter(
    (
      scope,
    ): scope is Extract<HistoricalBackfillScopeResult, { kind: "attempted" }> =>
      scope.kind === "attempted",
  );
  const succeeded = attempted.filter(
    (scope) => scope.outcome.status === "succeeded",
  ).length;
  const partial = attempted.filter(
    (scope) => scope.outcome.status === "partial",
  ).length;
  const failed = attempted.filter(
    (scope) => scope.outcome.status === "failed",
  ).length;
  return {
    status: failed > 0 ? "failed" : partial > 0 ? "partial" : "succeeded",
    scopes,
    skipped: scopes.length - attempted.length,
    succeeded,
    partial,
    failed,
  };
}

export type HistoricalCoverageWeek = {
  season: number;
  week: number;
  status: HistoricalBackfillScope["status"] | "missing";
  recordsImported: number;
  unmatchedPlayerCount: number;
  hasUsableSnapshot: boolean;
};

export async function retrieveHistoricalBackfillSummary(
  now = new Date(),
): Promise<{
  firstSeason: number;
  latestSeason: number;
  weeks: HistoricalCoverageWeek[];
}> {
  const latestSeason = latestCompletedNFLSeason(now);
  const scopes = await listHistoricalBackfillScopes(
    NFLVERSE_PROVIDER_DESCRIPTOR.slug,
  );
  const byScope = new Map(
    scopes.map((scope) => [`${scope.season}:${scope.week}`, scope]),
  );
  const weeks: HistoricalCoverageWeek[] = [];
  for (
    let season = NFLVERSE_FIRST_SUPPORTED_SEASON;
    season <= latestSeason;
    season += 1
  ) {
    for (let week = 1; week <= NFLVERSE_LAST_REGULAR_SEASON_WEEK; week += 1) {
      const scope = byScope.get(`${season}:${week}`);
      weeks.push({
        season,
        week,
        status: scope?.status ?? "missing",
        recordsImported: scope?.recordsImported ?? 0,
        unmatchedPlayerCount: scope?.unmatchedPlayerCount ?? 0,
        hasUsableSnapshot: scope?.hasUsableSnapshot ?? false,
      });
    }
  }
  return {
    firstSeason: NFLVERSE_FIRST_SUPPORTED_SEASON,
    latestSeason,
    weeks,
  };
}
