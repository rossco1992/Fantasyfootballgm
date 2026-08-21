import { z } from "zod";

import type {
  ProviderDescriptor,
  ProviderIngestionRequest,
  ProviderRecordCandidate,
  ProviderSnapshotCandidate,
  SourceCoverage,
} from "@/domain/fantasy-data";
import type { FantasyDataProviderAdapter } from "@/providers/types";

export const SLEEPER_TREND_TYPES = ["add", "drop"] as const;
export type SleeperTrendType = (typeof SLEEPER_TREND_TYPES)[number];

const sleeperTrendSchema = z.object({
  player_id: z.string().trim().min(1).max(255),
  count: z.number().int().nonnegative(),
});

type AvailableSleeperTrends = {
  status: "available";
  sourceUrl: string;
  observedAt: string;
  trends: z.infer<typeof sleeperTrendSchema>[];
};

type UnavailableSleeperTrends = {
  status: "unavailable";
  sourceUrl: string;
  observedAt: null;
  error: string;
};

export type SleeperTrendDataset =
  AvailableSleeperTrends | UnavailableSleeperTrends;

export type SleeperTrendingPayload = {
  season: number;
  week: number | null;
  lookbackHours: number;
  datasets: Record<SleeperTrendType, SleeperTrendDataset>;
};

export interface SleeperTrendingClient {
  fetchTrends(
    type: SleeperTrendType,
    lookbackHours: number,
    limit: number,
  ): Promise<SleeperTrendDataset>;
}

export const SLEEPER_TRENDING_DESCRIPTOR: ProviderDescriptor = {
  slug: "sleeper",
  name: "Sleeper",
  adapterVersion: "1.0.0",
  staleAfterSeconds: 3_600,
};

export function sleeperTrendingUrl(
  type: SleeperTrendType,
  lookbackHours: number,
  limit: number,
): string {
  return `https://api.sleeper.app/v1/players/nfl/trending/${type}?lookback_hours=${lookbackHours}&limit=${limit}`;
}

export class HttpSleeperTrendingClient implements SleeperTrendingClient {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async fetchTrends(
    type: SleeperTrendType,
    lookbackHours: number,
    limit: number,
  ): Promise<SleeperTrendDataset> {
    const sourceUrl = sleeperTrendingUrl(type, lookbackHours, limit);
    try {
      const response = await this.fetcher(sourceUrl, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(
          `Sleeper ${type} trends returned HTTP ${response.status}.`,
        );
      }
      return {
        status: "available",
        sourceUrl,
        observedAt: this.clock().toISOString(),
        trends: z.array(sleeperTrendSchema).parse(await response.json()),
      };
    } catch (error) {
      return {
        status: "unavailable",
        sourceUrl,
        observedAt: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function latestObservedAt(datasets: SleeperTrendDataset[]): string {
  const timestamps = datasets.flatMap((dataset) =>
    dataset.status === "available" ? [dataset.observedAt] : [],
  );
  if (timestamps.length === 0) {
    throw new Error("Sleeper add and drop trends were both unavailable.");
  }
  return timestamps.sort().at(-1)!;
}

function coverage(
  type: SleeperTrendType,
  dataset: SleeperTrendDataset,
): SourceCoverage {
  return dataset.status === "available"
    ? {
        dataset: `sleeper_${type}_trends`,
        status: "available",
        recordCount: dataset.trends.length,
        sourceUrl: dataset.sourceUrl,
        observedAt: dataset.observedAt,
        detail: null,
      }
    : {
        dataset: `sleeper_${type}_trends`,
        status: "unavailable",
        recordCount: 0,
        sourceUrl: dataset.sourceUrl,
        observedAt: null,
        detail: dataset.error,
      };
}

function normalizeRecords(
  payload: SleeperTrendingPayload,
): ProviderRecordCandidate[] {
  return SLEEPER_TREND_TYPES.flatMap((type) => {
    const dataset = payload.datasets[type];
    if (dataset.status === "unavailable") return [];
    return dataset.trends.map((trend) => ({
      externalPlayerId: trend.player_id,
      recordKey: `${trend.player_id}:market-trend:${type}:${payload.lookbackHours}h`,
      normalized: {
        type: "market_trend",
        metrics:
          type === "add"
            ? { adds: trend.count, lookbackHours: payload.lookbackHours }
            : { drops: trend.count, lookbackHours: payload.lookbackHours },
        direction: type === "add" ? "rising" : "falling",
      },
      raw: { type, ...trend, lookbackHours: payload.lookbackHours },
    }));
  });
}

export class SleeperTrendingAdapter implements FantasyDataProviderAdapter<SleeperTrendingPayload> {
  readonly descriptor = SLEEPER_TRENDING_DESCRIPTOR;

  constructor(
    private readonly client: SleeperTrendingClient = new HttpSleeperTrendingClient(),
    private readonly lookbackHours = 24,
    private readonly limit = 100,
  ) {}

  async fetch(
    request: ProviderIngestionRequest,
  ): Promise<SleeperTrendingPayload> {
    const [adds, drops] = await Promise.all([
      this.client.fetchTrends("add", this.lookbackHours, this.limit),
      this.client.fetchTrends("drop", this.lookbackHours, this.limit),
    ]);
    if (adds.status === "unavailable" && drops.status === "unavailable") {
      throw new Error("Sleeper add and drop trends were both unavailable.");
    }
    return {
      season: request.season,
      week: request.week,
      lookbackHours: this.lookbackHours,
      datasets: { add: adds, drop: drops },
    };
  }

  normalize(
    payload: SleeperTrendingPayload,
    request: ProviderIngestionRequest,
  ): ProviderSnapshotCandidate {
    if (payload.season !== request.season || payload.week !== request.week) {
      throw new Error(
        "Sleeper trend payload scope does not match the request.",
      );
    }
    return {
      season: request.season,
      week: request.week,
      observedAt: latestObservedAt(Object.values(payload.datasets)),
      provenance: {
        source: this.descriptor.name,
        sourceId: `${request.season}-week-${request.week ?? "preseason"}-${payload.lookbackHours}h`,
        sourceUrl: "https://docs.sleeper.com/",
        notes: [
          "Sleeper add/drop activity is market context, not an expected-performance projection.",
          "Attribution: Sleeper trending players API.",
        ],
        coverage: SLEEPER_TREND_TYPES.map((type) =>
          coverage(type, payload.datasets[type]),
        ),
      },
      records: normalizeRecords(payload),
    };
  }
}

export const sleeperTrendingAdapter = new SleeperTrendingAdapter();
