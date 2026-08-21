import {
  listLatestGames,
  listLatestMarketTrends,
  listLatestPlayerData,
} from "@/db/repositories/provider-ingestion";
import type { ProviderIngestionRequest } from "@/domain/fantasy-data";
import {
  NflverseProviderAdapter,
  type NflversePayload,
} from "@/providers/nflverse/nflverse-provider-adapter";
import {
  SleeperTrendingAdapter,
  type SleeperTrendingPayload,
} from "@/providers/sleeper/sleeper-trending-adapter";
import type { FantasyDataProviderAdapter } from "@/providers/types";
import {
  runOnDemandProviderIngestion,
  runScheduledProviderIngestion,
  type IngestionOptions,
  type ProviderIngestionOutcome,
} from "@/services/provider-ingestion";

export type HistoricalContextRefreshOptions = {
  nflverseAdapter?: FantasyDataProviderAdapter<NflversePayload>;
  sleeperAdapter?: FantasyDataProviderAdapter<SleeperTrendingPayload>;
  ingestion?: IngestionOptions;
};

export type HistoricalContextScope = { season: number; week: number };

export type HistoricalContextRefreshResult = {
  status: "succeeded" | "partial" | "failed";
  nflverse: ProviderIngestionOutcome;
  sleeper: ProviderIngestionOutcome;
};

function combinedStatus(
  outcomes: ProviderIngestionOutcome[],
): HistoricalContextRefreshResult["status"] {
  if (outcomes.every((outcome) => outcome.status === "failed")) return "failed";
  if (outcomes.some((outcome) => outcome.status !== "succeeded")) {
    return "partial";
  }
  return "succeeded";
}

/**
 * Refresh nflverse first so its explicit GSIS-to-Sleeper roster crosswalk is
 * available before Sleeper trend rows resolve through the canonical map.
 */
export async function refreshHistoricalContext(
  scope: HistoricalContextScope,
  trigger: ProviderIngestionRequest["trigger"],
  options: HistoricalContextRefreshOptions = {},
): Promise<HistoricalContextRefreshResult> {
  const run =
    trigger === "scheduled"
      ? runScheduledProviderIngestion
      : runOnDemandProviderIngestion;
  const nflverse = await run(
    options.nflverseAdapter ?? new NflverseProviderAdapter(),
    scope,
    options.ingestion,
  );
  const sleeper = await run(
    options.sleeperAdapter ?? new SleeperTrendingAdapter(),
    scope,
    options.ingestion,
  );
  return {
    status: combinedStatus([nflverse, sleeper]),
    nflverse,
    sleeper,
  };
}

export async function getPlayerWeekHistoricalContext(input: {
  playerId: string;
  season: number;
  week: number;
}) {
  const [performance, usage, games, marketTrends] = await Promise.all([
    listLatestPlayerData({
      playerId: input.playerId,
      dataType: "historical_performance",
      season: input.season,
      week: input.week,
    }),
    listLatestPlayerData({
      playerId: input.playerId,
      dataType: "usage",
      season: input.season,
      week: input.week,
    }),
    listLatestGames({ season: input.season, week: input.week }),
    listLatestMarketTrends({ season: input.season, week: input.week }),
  ]);

  return {
    performance,
    usage,
    games,
    marketTrends: marketTrends.filter(
      (trend) => trend.playerId === input.playerId,
    ),
  };
}
