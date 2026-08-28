import { describe, expect, it, vi } from "vitest";

import {
  providerPlayerIdentityCandidateSchema,
  providerRecordCandidateSchema,
  providerSnapshotMetadataSchema,
} from "@/domain/fantasy-data";
import {
  FANTASYPROS_DATASETS,
  FantasyProsProviderAdapter,
  HttpFantasyProsDataClient,
  type FantasyProsDataClient,
  type FantasyProsPayload,
} from "@/providers/fantasypros/fantasypros-provider-adapter";
import type { JsonDataset } from "@/providers/shared/normalized-feed";
import { describeProviderAdapterContract } from "@/tests/contracts/provider-adapter.contract";

const request = { trigger: "on_demand" as const, season: 2026, week: null };

function available(payload: unknown): JsonDataset {
  return {
    status: "available",
    sourceUrl: "https://api.fantasypros.com/public/v2/json/nfl/example",
    observedAt: "2026-08-27T12:00:00.000Z",
    payload: JSON.parse(JSON.stringify(payload)),
  };
}

const player = {
  player_id: "fp-1",
  player_name: "Example Runner",
  player_team_id: "SF",
  player_position_id: "RB",
  player_sleeper_id: "sleeper-1",
  player_status: "active",
};

const payload: FantasyProsPayload = {
  datasets: {
    players: available({ players: [player] }),
    rankings: available({
      players: [
        { ...player, rank_ecr: 4, rank_position: 2, tier: 1, rank_adp: 6.5 },
      ],
    }),
    projections: available({
      players: [{ ...player, fantasy_points: 287.4, rushing_yards: 1080 }],
    }),
    injuries: available({
      players: [
        {
          ...player,
          injury_status: "Q",
          practice_status: "Limited",
          injury: "Calf",
        },
      ],
    }),
    news: available({
      items: [
        {
          ...player,
          news_id: "news-1",
          headline: "Runner practices",
          published_at: "2026-08-27T11:00:00Z",
        },
      ],
    }),
  },
};

class FixtureClient implements FantasyProsDataClient {
  async fetchAll(): Promise<FantasyProsPayload> {
    return structuredClone(payload);
  }
}

function adapter() {
  return new FantasyProsProviderAdapter(new FixtureClient());
}

describeProviderAdapterContract({
  name: "FantasyPros",
  createAdapter: adapter,
  request,
});

describe("FantasyPros provider adapter", () => {
  it("normalizes identity aliases, ECR, ADP, projections, injury and news", async () => {
    const instance = adapter();
    const snapshot = instance.normalize(await instance.fetch(request), request);
    const metadata = providerSnapshotMetadataSchema.parse(snapshot);
    const players = (snapshot.players as unknown[]).map((entry) =>
      providerPlayerIdentityCandidateSchema.parse(entry),
    );
    const records = (snapshot.records as unknown[]).map((entry) =>
      providerRecordCandidateSchema.parse(entry),
    );

    expect(metadata.provenance.coverage).toHaveLength(
      FANTASYPROS_DATASETS.length,
    );
    expect(players[0]).toMatchObject({
      externalPlayerId: "fp-1",
      aliases: [{ providerSlug: "sleeper", externalId: "sleeper-1" }],
    });
    expect(records.map((record) => record.normalized.type)).toEqual([
      "ranking",
      "adp",
      "projection",
      "injury",
      "news",
    ]);
    expect(records[3]?.normalized).toMatchObject({
      type: "injury",
      status: "questionable",
    });
  });

  it("sends the API key only in the request header", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ players: [player] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new HttpFantasyProsDataClient("secret-key", fetcher);
    const result = await client.fetchAll(request, "ppr");

    expect(fetcher).toHaveBeenCalledTimes(FANTASYPROS_DATASETS.length);
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).not.toContain("secret-key");
      expect(init?.headers).toMatchObject({ "x-api-key": "secret-key" });
    }
    expect(
      Object.values(result.datasets).every((dataset) =>
        dataset.sourceUrl.includes("secret-key"),
      ),
    ).toBe(false);
  });

  it("reports partial coverage without discarding available datasets", async () => {
    const partial = structuredClone(payload);
    partial.datasets.news = {
      status: "unavailable",
      sourceUrl: "https://api.fantasypros.com/public/v2/json/nfl/news",
      observedAt: null,
      error: "HTTP 503",
    };
    const client: FantasyProsDataClient = { fetchAll: async () => partial };
    const instance = new FantasyProsProviderAdapter(client);
    const snapshot = instance.normalize(await instance.fetch(request), request);
    expect(
      providerSnapshotMetadataSchema.parse(snapshot).provenance.coverage,
    ).toContainEqual(
      expect.objectContaining({ dataset: "news", status: "unavailable" }),
    );
  });

  it("rejects an empty successful response instead of replacing valid data", async () => {
    const empty = structuredClone(payload);
    for (const dataset of FANTASYPROS_DATASETS) {
      empty.datasets[dataset] = available({ players: [] });
    }
    const instance = new FantasyProsProviderAdapter({
      fetchAll: async () => empty,
    });

    await expect(instance.fetch(request)).rejects.toThrow(
      "FantasyPros returned no recognized records.",
    );
  });

  it("rejects non-empty rows when schema drift makes them unusable", async () => {
    const unrecognized = structuredClone(payload);
    for (const dataset of FANTASYPROS_DATASETS) {
      unrecognized.datasets[dataset] = available({
        players: [{ unexpected_field: "value" }],
      });
    }
    const instance = new FantasyProsProviderAdapter({
      fetchAll: async () => unrecognized,
    });

    await expect(instance.fetch(request)).rejects.toThrow(
      "FantasyPros returned no recognized records.",
    );
  });
});
