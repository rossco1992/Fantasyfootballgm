import { describe, expect, it, vi } from "vitest";

import {
  providerPlayerIdentityCandidateSchema,
  providerRecordCandidateSchema,
} from "@/domain/fantasy-data";
import {
  FANTASYNERDS_DATASETS,
  FantasyNerdsProviderAdapter,
  HttpFantasyNerdsDataClient,
  type FantasyNerdsDataClient,
  type FantasyNerdsPayload,
} from "@/providers/fantasynerds/fantasynerds-provider-adapter";
import type { JsonDataset } from "@/providers/shared/normalized-feed";
import { describeProviderAdapterContract } from "@/tests/contracts/provider-adapter.contract";

const request = { trigger: "on_demand" as const, season: 2026, week: 3 };

function available(payload: unknown): JsonDataset {
  return {
    status: "available",
    sourceUrl: "https://api.fantasynerds.com/v1/nfl/example",
    observedAt: "2026-09-20T12:00:00.000Z",
    payload: JSON.parse(JSON.stringify(payload)),
  };
}

const player = {
  playerId: "fn-1",
  name: "Example Receiver",
  team: "NYJ",
  position: "WR",
  active: "active",
};

const payload: FantasyNerdsPayload = {
  datasets: {
    players: available({ players: [player] }),
    rankings: available({
      rankings: [{ ...player, rank: 8, rank_position: 4 }],
    }),
    projections: available({
      projections: [{ ...player, proj_pts: 12, proj_pts_ppr: 17, targets: 9 }],
    }),
    adp: available({ players: [{ ...player, adp: 22.4 }] }),
    injuries: available({
      injuries: [{ ...player, game_status: "D", injury: "Hamstring" }],
    }),
    news: available({
      news: [
        {
          ...player,
          article_id: "article-1",
          article_headline: "Receiver returns",
          article_date: "2026-09-20T11:00:00Z",
        },
      ],
    }),
  },
};

class FixtureClient implements FantasyNerdsDataClient {
  async fetchAll(): Promise<FantasyNerdsPayload> {
    return structuredClone(payload);
  }
}

function adapter() {
  return new FantasyNerdsProviderAdapter(new FixtureClient());
}

describeProviderAdapterContract({
  name: "Fantasy Nerds",
  createAdapter: adapter,
  request,
});

describe("Fantasy Nerds provider adapter", () => {
  it("normalizes rankings, projections, ADP, injury, news and identities", async () => {
    const instance = adapter();
    const snapshot = instance.normalize(await instance.fetch(request), request);
    const players = (snapshot.players as unknown[]).map((entry) =>
      providerPlayerIdentityCandidateSchema.parse(entry),
    );
    const records = (snapshot.records as unknown[]).map((entry) =>
      providerRecordCandidateSchema.parse(entry),
    );
    expect(players[0]).toMatchObject({ externalPlayerId: "fn-1" });
    expect(records.map((record) => record.normalized.type)).toEqual([
      "ranking",
      "projection",
      "adp",
      "injury",
      "news",
    ]);
    expect(records[3]?.normalized).toMatchObject({
      type: "injury",
      status: "doubtful",
    });
  });

  it("uses the provider-required query credential without retaining it in provenance", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ players: [player] }), { status: 200 }),
      );
    const client = new HttpFantasyNerdsDataClient("secret-key", fetcher);
    const result = await client.fetchAll(request, "ppr");
    expect(fetcher).toHaveBeenCalledTimes(FANTASYNERDS_DATASETS.length);
    expect(
      fetcher.mock.calls.every(([url]) => String(url).includes("secret-key")),
    ).toBe(true);
    expect(
      Object.values(result.datasets).every(
        (dataset) => !dataset.sourceUrl.includes("secret-key"),
      ),
    ).toBe(true);
  });

  it("rejects an empty successful response instead of replacing valid data", async () => {
    const empty = structuredClone(payload);
    for (const dataset of FANTASYNERDS_DATASETS) {
      empty.datasets[dataset] = available({ players: [] });
    }
    const instance = new FantasyNerdsProviderAdapter({
      fetchAll: async () => empty,
    });

    await expect(instance.fetch(request)).rejects.toThrow(
      "Fantasy Nerds returned no recognized records.",
    );
  });
});
