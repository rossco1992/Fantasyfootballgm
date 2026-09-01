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
  player_id: 101,
  player_name: "Example Runner",
  team_id: "SF",
  position_id: "RB",
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
      players: [
        {
          fpid: "101",
          name: "Example Runner",
          team_id: "SF",
          position_id: "RB",
          stats: [
            {
              points: 247,
              points_ppr: 287.4,
              points_half: 267.2,
              rush_yds: 1080,
            },
          ],
        },
      ],
    }),
    injuries: available({
      injuries: [
        {
          player_id: 101,
          name: "Example Runner",
          status: "Questionable",
          practice_3: "Limit",
          practice_report_injury_type: "Calf",
        },
      ],
    }),
    news: available({
      items: [
        {
          id: 501,
          player_id: 101,
          title: "Example Runner returns to practice",
          impact: "He was limited and remains worth monitoring.",
          created: "2026-08-27 11:30:00",
          link: "https://www.fantasypros.com/nfl/news/example.php",
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
  it("normalizes identities, ECR, ADP, projections, injuries, and news", async () => {
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
      externalPlayerId: "101",
      fullName: "Example Runner",
    });
    expect(records.map((record) => record.normalized.type)).toEqual([
      "ranking",
      "adp",
      "projection",
      "injury",
      "news",
    ]);
    expect(records[2]?.normalized).toMatchObject({
      type: "projection",
      projectedPoints: 287.4,
      stats: { rushingYards: 1080 },
    });
    expect(records[3]?.normalized).toMatchObject({
      type: "injury",
      status: "questionable",
    });
    expect(records[4]?.normalized).toMatchObject({
      type: "news",
      headline: "Example Runner returns to practice",
      publishedAt: "2026-08-27T11:30:00.000Z",
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
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "/nfl/2026/consensus-rankings?position=ALL&type=DRAFT&scoring=PPR&week=0",
        ),
        expect.stringContaining("/nfl/2026/projections?position=ALL&week=0"),
        expect.stringContaining(
          "/nfl/injuries?year=2026&week=0&include_probabilities=true",
        ),
        expect.stringContaining("/nfl/news?limit=100&order_by=updated"),
      ]),
    );
  });

  it("reports partial coverage without discarding available datasets", async () => {
    const partial = structuredClone(payload);
    partial.datasets.injuries = {
      status: "unavailable",
      sourceUrl: "https://api.fantasypros.com/public/v2/json/nfl/injuries",
      observedAt: null,
      error: "HTTP 503",
    };
    const client: FantasyProsDataClient = { fetchAll: async () => partial };
    const instance = new FantasyProsProviderAdapter(client);
    const snapshot = instance.normalize(await instance.fetch(request), request);
    expect(
      providerSnapshotMetadataSchema.parse(snapshot).provenance.coverage,
    ).toContainEqual(
      expect.objectContaining({ dataset: "injuries", status: "unavailable" }),
    );
  });

  it("does not replace a complete snapshot when a core dataset is unavailable", async () => {
    const partial = structuredClone(payload);
    partial.datasets.projections = {
      status: "unavailable",
      sourceUrl:
        "https://api.fantasypros.com/public/v2/json/nfl/2026/projections",
      observedAt: null,
      error: "HTTP 429",
    };
    const instance = new FantasyProsProviderAdapter({
      fetchAll: async () => partial,
    });

    await expect(instance.fetch(request)).rejects.toThrow(
      "FantasyPros core datasets were unavailable: projections.",
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
