import { describe, expect, it } from "vitest";

import {
  providerRecordCandidateSchema,
  providerSnapshotMetadataSchema,
} from "@/domain/fantasy-data";
import {
  SleeperTrendingAdapter,
  type SleeperTrendDataset,
  type SleeperTrendingClient,
  type SleeperTrendType,
} from "@/providers/sleeper/sleeper-trending-adapter";
import { describeProviderAdapterContract } from "@/tests/contracts/provider-adapter.contract";

const request = { trigger: "scheduled" as const, season: 2025, week: 1 };

function available(
  type: SleeperTrendType,
  trends: { player_id: string; count: number }[],
): SleeperTrendDataset {
  return {
    status: "available",
    sourceUrl: `https://example.test/sleeper/${type}`,
    observedAt: "2025-09-08T12:00:00.000Z",
    trends,
  };
}

function unavailable(type: SleeperTrendType): SleeperTrendDataset {
  return {
    status: "unavailable",
    sourceUrl: `https://example.test/sleeper/${type}`,
    observedAt: null,
    error: `${type} unavailable`,
  };
}

class FixtureSleeperClient implements SleeperTrendingClient {
  constructor(
    private readonly datasets: Record<SleeperTrendType, SleeperTrendDataset>,
  ) {}

  async fetchTrends(type: SleeperTrendType): Promise<SleeperTrendDataset> {
    return structuredClone(this.datasets[type]);
  }
}

const datasets: Record<SleeperTrendType, SleeperTrendDataset> = {
  add: available("add", [{ player_id: "4034", count: 120 }]),
  drop: available("drop", [{ player_id: "9999", count: 45 }]),
};

function adapter(
  fixture: Record<SleeperTrendType, SleeperTrendDataset> = datasets,
) {
  return new SleeperTrendingAdapter(new FixtureSleeperClient(fixture));
}

describeProviderAdapterContract({
  name: "Sleeper market trends",
  createAdapter: adapter,
  request,
});

describe("Sleeper trending adapter", () => {
  it("keeps add/drop activity separate and labels it as market context", async () => {
    const instance = adapter();
    const snapshot = instance.normalize(await instance.fetch(request), request);
    const records = (snapshot.records as unknown[]).map((record) =>
      providerRecordCandidateSchema.parse(record),
    );
    const metadata = providerSnapshotMetadataSchema.parse(snapshot);

    expect(records).toEqual([
      expect.objectContaining({
        externalPlayerId: "4034",
        normalized: expect.objectContaining({
          type: "market_trend",
          metrics: { adds: 120, lookbackHours: 24 },
          direction: "rising",
        }),
      }),
      expect.objectContaining({
        externalPlayerId: "9999",
        normalized: expect.objectContaining({
          type: "market_trend",
          metrics: { drops: 45, lookbackHours: 24 },
          direction: "falling",
        }),
      }),
    ]);
    expect(metadata.provenance.notes.join(" ")).toMatch(
      /market context, not an expected-performance projection/,
    );
  });

  it("continues with explicit partial coverage when one trend endpoint fails", async () => {
    const partial = {
      add: datasets.add,
      drop: unavailable("drop"),
    };
    const instance = adapter(partial);
    const snapshot = instance.normalize(await instance.fetch(request), request);
    const metadata = providerSnapshotMetadataSchema.parse(snapshot);

    expect(snapshot.records).toHaveLength(1);
    expect(metadata.provenance.coverage).toContainEqual(
      expect.objectContaining({
        dataset: "sleeper_drop_trends",
        status: "unavailable",
      }),
    );
  });

  it("fails when both trend endpoints are unavailable", async () => {
    await expect(
      adapter({ add: unavailable("add"), drop: unavailable("drop") }).fetch(
        request,
      ),
    ).rejects.toThrow(/both unavailable/);
  });
});
