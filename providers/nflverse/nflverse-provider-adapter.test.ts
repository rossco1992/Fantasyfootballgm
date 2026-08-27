import { describe, expect, it, vi } from "vitest";

import {
  providerGameCandidateSchema,
  providerPlayerIdentityCandidateSchema,
  providerRecordCandidateSchema,
  providerSnapshotMetadataSchema,
} from "@/domain/fantasy-data";
import {
  NFLVERSE_DATASETS,
  HttpNflverseDataClient,
  NflverseProviderAdapter,
  type NflverseDataClient,
  type NflverseDataset,
  type NflverseDatasetName,
} from "@/providers/nflverse/nflverse-provider-adapter";
import { describeProviderAdapterContract } from "@/tests/contracts/provider-adapter.contract";

const request = { trigger: "on_demand" as const, season: 2025, week: 1 };

function available(rows: Record<string, string>[]): NflverseDataset {
  return {
    status: "available",
    sourceUrl: "https://example.test/nflverse.csv",
    observedAt: "2025-09-08T08:00:00.000Z",
    rows,
  };
}

function unavailable(message = "not published"): NflverseDataset {
  return {
    status: "unavailable",
    sourceUrl: "https://example.test/nflverse.csv",
    observedAt: null,
    error: message,
  };
}

const datasets: Record<NflverseDatasetName, NflverseDataset> = {
  weekly_rosters: available([
    {
      season: "2025",
      week: "1",
      team: "SF",
      position: "RB",
      status: "ACT",
      full_name: "Christian McCaffrey",
      gsis_id: "00-0033280",
      sleeper_id: "4034",
    },
  ]),
  weekly_player_stats: available([
    {
      player_id: "00-0033280",
      player_display_name: "Christian McCaffrey",
      position: "RB",
      season: "2025",
      week: "1",
      game_id: "2025_01_SF_SEA",
      carries: "20",
      rushing_yards: "112",
      rushing_tds: "1",
      targets: "6",
      receptions: "5",
      receiving_yards: "42",
      target_share: "0.24",
      fantasy_points: "21.4",
      fantasy_points_ppr: "26.4",
    },
  ]),
  play_by_play_participation: available([
    {
      nflverse_game_id: "2025_01_SF_SEA",
      play_id: "1",
      offense_players: "00-0033280;00-0039999",
    },
    {
      nflverse_game_id: "2025_01_SF_SEA",
      play_id: "2",
      offense_players: "00-0033280;00-0039999",
    },
  ]),
  schedules: available([
    {
      game_id: "2025_01_SF_SEA",
      season: "2025",
      game_type: "REG",
      week: "1",
      gameday: "2025-09-07",
      gametime: "13:00",
      away_team: "SF",
      away_score: "27",
      home_team: "SEA",
      home_score: "20",
      location: "Home",
    },
  ]),
};

class FixtureNflverseClient implements NflverseDataClient {
  constructor(
    private readonly fixture: Record<NflverseDatasetName, NflverseDataset>,
  ) {}

  async fetchDataset(dataset: NflverseDatasetName): Promise<NflverseDataset> {
    return structuredClone(this.fixture[dataset]);
  }
}

function adapter(
  fixture: Record<NflverseDatasetName, NflverseDataset> = datasets,
) {
  return new NflverseProviderAdapter(new FixtureNflverseClient(fixture));
}

describeProviderAdapterContract({
  name: "nflverse historical context",
  createAdapter: adapter,
  request,
});

describe("nflverse provider adapter", () => {
  it("downloads each season dataset once when one client backfills multiple weeks", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("season,week\n2025,1\n", {
        status: 200,
        headers: { "last-modified": "Mon, 08 Sep 2025 08:00:00 GMT" },
      }),
    );
    const client = new HttpNflverseDataClient(fetcher);

    const [first, second] = await Promise.all([
      client.fetchDataset("weekly_rosters", "https://example.test/2025.csv"),
      client.fetchDataset("weekly_rosters", "https://example.test/2025.csv"),
    ]);

    expect(first).toEqual(second);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("retries a season dataset after a transient unavailable response", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("offline", { status: 503 }))
      .mockResolvedValueOnce(
        new Response("season,week\n2025,1\n", { status: 200 }),
      );
    const client = new HttpNflverseDataClient(fetcher);
    const sourceUrl = "https://example.test/2025.csv";

    await expect(
      client.fetchDataset("weekly_rosters", sourceUrl),
    ).resolves.toMatchObject({ status: "unavailable" });
    await expect(
      client.fetchDataset("weekly_rosters", sourceUrl),
    ).resolves.toMatchObject({ status: "available" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("normalizes canonical aliases, weekly history/usage, and schedule games", async () => {
    const instance = adapter();
    const snapshot = instance.normalize(await instance.fetch(request), request);
    const players = (snapshot.players as unknown[]).map((player) =>
      providerPlayerIdentityCandidateSchema.parse(player),
    );
    const records = (snapshot.records as unknown[]).map((record) =>
      providerRecordCandidateSchema.parse(record),
    );
    const games = (snapshot.games as unknown[]).map((game) =>
      providerGameCandidateSchema.parse(game),
    );

    expect(players[0]).toMatchObject({
      externalPlayerId: "00-0033280",
      fullName: "Christian McCaffrey",
      aliases: [{ providerSlug: "sleeper", externalId: "4034" }],
    });
    expect(records.map((record) => record.normalized.type)).toEqual([
      "historical_performance",
      "usage",
    ]);
    expect(records[1]?.normalized).toMatchObject({
      type: "usage",
      metrics: { carries: 20, targets: 6, offensiveSnaps: 2 },
    });
    expect(games[0]).toMatchObject({
      externalGameId: "2025_01_SF_SEA",
      kickoffAt: "2025-09-07T17:00:00.000Z",
      awayTeam: "SF",
      homeTeam: "SEA",
    });
  });

  it("surfaces delayed participation as a coverage gap without discarding other data", async () => {
    const partial = structuredClone(datasets);
    partial.play_by_play_participation = unavailable();
    const instance = adapter(partial);
    const snapshot = instance.normalize(await instance.fetch(request), request);
    const metadata = providerSnapshotMetadataSchema.parse(snapshot);

    expect(snapshot.records).toHaveLength(2);
    expect(metadata.provenance.coverage).toContainEqual(
      expect.objectContaining({
        dataset: "play_by_play_participation",
        status: "unavailable",
        detail: "not published",
      }),
    );
  });

  it("fails only when every nflverse component is unavailable", async () => {
    const missing = Object.fromEntries(
      NFLVERSE_DATASETS.map((dataset) => [dataset, unavailable("offline")]),
    ) as Record<NflverseDatasetName, NflverseDataset>;

    await expect(adapter(missing).fetch(request)).rejects.toThrow(
      /All nflverse datasets were unavailable/,
    );
  });
});
