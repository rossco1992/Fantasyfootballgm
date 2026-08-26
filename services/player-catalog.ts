import { countDraftablePlayers } from "@/db/repositories/players";
import type { ProviderFreshness } from "@/services/provider-ingestion";
import {
  type IngestionOptions,
  type ProviderIngestionOutcome,
  retrieveProviderFreshness,
  runOnDemandProviderIngestion,
} from "@/services/provider-ingestion";
import {
  SLEEPER_PLAYER_CATALOG_DESCRIPTOR,
  sleeperPlayerCatalogAdapter,
  type SleeperPlayerCatalogPayload,
} from "@/providers/sleeper/sleeper-player-catalog-adapter";
import type { FantasyDataProviderAdapter } from "@/providers/types";

export type PlayerCatalogRefreshResult =
  | {
      kind: "skipped";
      reason: "fresh";
      freshness: ProviderFreshness;
    }
  | {
      kind: "refreshed";
      outcome: ProviderIngestionOutcome;
    };

type RefreshOptions = IngestionOptions & {
  adapter?: FantasyDataProviderAdapter<SleeperPlayerCatalogPayload>;
  force?: boolean;
};

export async function refreshSleeperPlayerCatalog(
  season: number,
  options: RefreshOptions = {},
): Promise<PlayerCatalogRefreshResult> {
  const freshness = await retrieveProviderFreshness(
    SLEEPER_PLAYER_CATALOG_DESCRIPTOR.slug,
    options,
  );
  if (!options.force && freshness && !freshness.isStale) {
    return { kind: "skipped", reason: "fresh", freshness };
  }

  const outcome = await runOnDemandProviderIngestion(
    options.adapter ?? sleeperPlayerCatalogAdapter,
    { season, week: null },
    options,
  );
  return { kind: "refreshed", outcome };
}

export async function retrievePlayerCatalogSummary(
  options: Pick<IngestionOptions, "store" | "clock"> = {},
): Promise<{
  playerCount: number;
  freshness: ProviderFreshness | null;
}> {
  const [playerCount, freshness] = await Promise.all([
    countDraftablePlayers(),
    retrieveProviderFreshness(SLEEPER_PLAYER_CATALOG_DESCRIPTOR.slug, options),
  ]);
  return { playerCount, freshness };
}
