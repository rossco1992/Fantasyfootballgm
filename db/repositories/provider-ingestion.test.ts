import { beforeEach, describe, expect, it, vi } from "vitest";

import { query, withTransaction } from "@/db/client";
import {
  failProviderIngestionRun,
  listLatestGames,
  listLatestMarketTrends,
  listLatestPlayerData,
  persistProviderSnapshot,
  startProviderIngestionRun,
  type PersistProviderSnapshotInput,
} from "@/db/repositories/provider-ingestion";
import { FIXTURE_PROVIDER_DESCRIPTOR } from "@/providers/fixture/fixture-provider-adapter";

vi.mock("@/db/client", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

const providerId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const snapshotId = "33333333-3333-4333-8333-333333333333";
const startedAt = new Date("2026-08-20T12:01:00.000Z");
const importedAt = new Date("2026-08-20T12:01:01.000Z");

const providerRow = {
  id: providerId,
  slug: "fixture-data",
  name: "Fixture Fantasy Data",
  created_at: startedAt,
};

const runRow = {
  id: runId,
  provider_id: providerId,
  trigger_type: "on_demand",
  status: "running",
  adapter_version: "1.0.0",
  season: 2026,
  week: 1,
  started_at: startedAt,
  completed_at: null,
  records_received: 0,
  records_imported: 0,
  records_rejected: 0,
  unmatched_player_count: 0,
  error_details: null,
  created_at: startedAt,
};

const snapshotRow = {
  id: snapshotId,
  provider_id: providerId,
  ingestion_run_id: runId,
  source_fingerprint: "a".repeat(64),
  adapter_version: "1.0.0",
  season: 2026,
  week: 1,
  observed_at: new Date("2026-08-20T12:00:00.000Z"),
  imported_at: importedAt,
  provenance: {
    source: "Fixture Fantasy Data",
    sourceId: "fixture-1",
    sourceUrl: null,
    notes: [],
  },
  created_at: importedAt,
};

const persistInput: PersistProviderSnapshotInput = {
  runId,
  providerId,
  descriptor: FIXTURE_PROVIDER_DESCRIPTOR,
  request: { trigger: "on_demand", season: 2026, week: 1 },
  snapshot: {
    season: 2026,
    week: 1,
    observedAt: "2026-08-20T12:00:00.000Z",
    provenance: snapshotRow.provenance,
  },
  sourceFingerprint: snapshotRow.source_fingerprint,
  records: [
    {
      externalPlayerId: "fixture-cmc",
      recordKey: "fixture-cmc:projection",
      normalized: {
        type: "projection",
        scoring: "ppr",
        projectedPoints: 21.7,
        stats: { receptions: 5 },
      },
      raw: { projected_points: "21.7" },
    },
  ],
  playerIdentities: [],
  games: [],
  rejections: [],
  importedAt,
};

describe("provider ingestion repository", () => {
  const client = { query: vi.fn() };

  beforeEach(() => {
    vi.mocked(query).mockReset();
    client.query.mockReset();
    vi.mocked(withTransaction).mockReset();
    vi.mocked(withTransaction).mockImplementation(async (work) =>
      work(client as never),
    );
  });

  it("starts a run and updates provider freshness atomically", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [providerRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [runRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await startProviderIngestionRun(
      FIXTURE_PROVIDER_DESCRIPTOR,
      { trigger: "on_demand", season: 2026, week: 1 },
      startedAt,
    );

    expect(result).toEqual({ id: runId, providerId });
    expect(client.query.mock.calls[0]?.[0]).toContain("on conflict (slug)");
    expect(client.query.mock.calls[2]?.[0]).toContain(
      "insert into provider_ingestion_state",
    );
  });

  it("persists raw and normalized records and completes the run", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await persistProviderSnapshot(persistInput);

    expect(result).toMatchObject({
      status: "succeeded",
      duplicate: false,
      recordsImported: 1,
      unmatchedPlayerCount: 0,
    });
    const recordInsert = client.query.mock.calls[1];
    expect(recordInsert?.[0]).toContain("normalized_payload, raw_payload");
    expect(recordInsert?.[1]?.[5]).toContain('"projectedPoints":21.7');
    expect(recordInsert?.[1]?.[6]).toBe('{"projected_points":"21.7"}');
  });

  it("creates explicit canonical aliases before persisting player history and games", async () => {
    const sleeperProviderId = "44444444-4444-4444-8444-444444444444";
    const playerId = "aaaaaaaa-0000-4000-8000-000000000001";
    client.query
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: sleeperProviderId,
            slug: "sleeper",
            name: "Sleeper",
            created_at: importedAt,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: playerId }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ player_id: playerId }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ player_id: playerId }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await persistProviderSnapshot({
      ...persistInput,
      playerIdentities: [
        {
          externalPlayerId: "fixture-cmc",
          fullName: "Christian McCaffrey",
          position: "RB",
          nflTeam: "SF",
          byeWeek: 14,
          status: "active",
          aliases: [
            {
              providerSlug: "sleeper",
              providerName: "Sleeper",
              externalId: "4034",
            },
          ],
          raw: { roster: true },
        },
      ],
      games: [
        {
          externalGameId: "2026_01_SF_SEA",
          season: 2026,
          week: 1,
          seasonType: "REG",
          kickoffAt: "2026-09-13T20:25:00.000Z",
          homeTeam: "SEA",
          awayTeam: "SF",
          homeScore: null,
          awayScore: null,
          neutralSite: false,
          raw: { game_id: "2026_01_SF_SEA" },
        },
      ],
    });

    expect(result).toMatchObject({
      playerIdentitiesReceived: 1,
      playerIdentitiesImported: 1,
      gamesReceived: 1,
      gamesImported: 1,
      unmatchedPlayerCount: 0,
    });
    const identityInsertIndex = client.query.mock.calls.findIndex((call) =>
      String(call[0]).includes("provider_player_identity_records"),
    );
    const dataInsertIndex = client.query.mock.calls.findIndex((call) =>
      String(call[0]).includes("insert into provider_data_records"),
    );
    expect(identityInsertIndex).toBeGreaterThan(-1);
    expect(identityInsertIndex).toBeLessThan(dataInsertIndex);
    expect(
      client.query.mock.calls.some((call) =>
        String(call[0]).includes("insert into provider_game_records"),
      ),
    ).toBe(true);
  });

  it("matches a manually created canonical player and refreshes its metadata", async () => {
    const playerId = "aaaaaaaa-0000-4000-8000-000000000001";
    const manualPlayer = {
      id: playerId,
      full_name: "Christian McCaffrey",
      position: "RB",
      nfl_team: null,
      bye_week: null,
      status: "unknown",
      created_at: importedAt,
      updated_at: importedAt,
    };
    client.query
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [manualPlayer], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ player_id: playerId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await persistProviderSnapshot({
      ...persistInput,
      records: [],
      playerIdentities: [
        {
          externalPlayerId: "4034",
          fullName: "Christian McCaffrey",
          position: "RB",
          nflTeam: "SF",
          byeWeek: null,
          status: "active",
          aliases: [],
          raw: { player_id: "4034" },
        },
      ],
    });

    expect(result.playerIdentitiesImported).toBe(1);
    expect(
      client.query.mock.calls.some(
        (call) =>
          String(call[0]).includes("update players") &&
          call[1]?.[0] === playerId &&
          call[1]?.[3] === "SF",
      ),
    ).toBe(true);
    expect(
      client.query.mock.calls.some((call) =>
        String(call[0]).includes("insert into players"),
      ),
    ).toBe(false);
  });

  it("queues ambiguous identities instead of merging or failing the snapshot", async () => {
    const firstCandidate = {
      id: "aaaaaaaa-0000-4000-8000-000000000001",
      full_name: "Shared Name",
      position: "WR",
      nfl_team: "NYJ",
      bye_week: 12,
      status: "active",
      created_at: importedAt,
      updated_at: importedAt,
    };
    const secondCandidate = {
      ...firstCandidate,
      id: "aaaaaaaa-0000-4000-8000-000000000002",
      nfl_team: "NYG",
    };
    client.query
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [firstCandidate, secondCandidate],
        rowCount: 2,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ player_id: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await persistProviderSnapshot({
      ...persistInput,
      records: [
        {
          ...persistInput.records[0]!,
          externalPlayerId: "shared-name",
          recordKey: "shared-name:projection",
        },
      ],
      playerIdentities: [
        {
          externalPlayerId: "shared-name",
          fullName: "Shared Name",
          position: "WR",
          nflTeam: null,
          byeWeek: null,
          status: "active",
          aliases: [],
          raw: { full_name: "Shared Name" },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "partial",
      playerIdentitiesImported: 0,
      unmatchedPlayerCount: 1,
    });
    expect(
      client.query.mock.calls.some((call) =>
        String(call[0]).includes("insert into player_match_reviews"),
      ),
    ).toBe(true);
    expect(
      client.query.mock.calls.some((call) =>
        String(call[0]).includes("insert into players"),
      ),
    ).toBe(false);
    const recordInsert = client.query.mock.calls.find((call) =>
      String(call[0]).includes("insert into provider_data_records"),
    );
    expect(String(recordInsert?.[0])).toContain(
      "case when $8::boolean then null",
    );
    expect(recordInsert?.[1]?.[7]).toBe(true);
    expect(
      client.query.mock.calls.filter((call) =>
        String(call[0]).includes("insert into player_match_reviews"),
      ),
    ).toHaveLength(1);
  });

  it("queues both sides of an alias conflict so either mapping can be corrected", async () => {
    const sleeperProviderId = "44444444-4444-4444-8444-444444444444";
    const primaryPlayerId = "aaaaaaaa-0000-4000-8000-000000000001";
    const conflictingPlayerId = "aaaaaaaa-0000-4000-8000-000000000002";
    client.query
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: sleeperProviderId,
            slug: "sleeper",
            name: "Sleeper",
            created_at: importedAt,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ player_id: primaryPlayerId }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ player_id: conflictingPlayerId }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await persistProviderSnapshot({
      ...persistInput,
      records: [],
      playerIdentities: [
        {
          externalPlayerId: "00-0033280",
          fullName: "Christian McCaffrey",
          position: "RB",
          nflTeam: "SF",
          byeWeek: null,
          status: "active",
          aliases: [
            {
              providerSlug: "sleeper",
              providerName: "Sleeper",
              externalId: "4034",
            },
          ],
          raw: { gsis_id: "00-0033280", sleeper_id: "4034" },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "partial",
      playerIdentitiesImported: 0,
      unmatchedPlayerCount: 1,
    });
    const reviewInserts = client.query.mock.calls.filter((call) =>
      String(call[0]).includes("insert into player_match_reviews"),
    );
    expect(reviewInserts).toHaveLength(2);
    expect(reviewInserts.map((call) => call[1]?.[1])).toEqual([
      "00-0033280",
      "4034",
    ]);
    for (const reviewInsert of reviewInserts) {
      expect(reviewInsert?.[1]?.[4]).toEqual([
        primaryPlayerId,
        conflictingPlayerId,
      ]);
    }
  });

  it("queues the unmapped primary ID when secondary aliases conflict", async () => {
    const sleeperProviderId = "44444444-4444-4444-8444-444444444444";
    const yahooProviderId = "55555555-5555-4555-8555-555555555555";
    const firstPlayerId = "aaaaaaaa-0000-4000-8000-000000000001";
    const secondPlayerId = "aaaaaaaa-0000-4000-8000-000000000002";
    client.query
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: sleeperProviderId,
            slug: "sleeper",
            name: "Sleeper",
            created_at: importedAt,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: yahooProviderId,
            slug: "yahoo",
            name: "Yahoo",
            created_at: importedAt,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ player_id: firstPlayerId }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ player_id: secondPlayerId }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await persistProviderSnapshot({
      ...persistInput,
      records: [],
      playerIdentities: [
        {
          externalPlayerId: "primary-unmapped",
          fullName: "Shared Identity",
          position: "WR",
          nflTeam: "NYJ",
          byeWeek: null,
          status: "active",
          aliases: [
            {
              providerSlug: "sleeper",
              providerName: "Sleeper",
              externalId: "sleeper-conflict",
            },
            {
              providerSlug: "yahoo",
              providerName: "Yahoo",
              externalId: "yahoo-conflict",
            },
          ],
          raw: { player: "Shared Identity" },
        },
      ],
    });

    const reviewInserts = client.query.mock.calls.filter((call) =>
      String(call[0]).includes("insert into player_match_reviews"),
    );
    expect(reviewInserts.map((call) => call[1]?.[1])).toEqual([
      "primary-unmapped",
      "sleeper-conflict",
      "yahoo-conflict",
    ]);
  });

  it("queues the unmapped primary ID when secondary aliases conflict", async () => {
    const sleeperProviderId = "44444444-4444-4444-8444-444444444444";
    const yahooProviderId = "55555555-5555-4555-8555-555555555555";
    const firstPlayerId = "aaaaaaaa-0000-4000-8000-000000000001";
    const secondPlayerId = "aaaaaaaa-0000-4000-8000-000000000002";
    client.query
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: sleeperProviderId,
            slug: "sleeper",
            name: "Sleeper",
            created_at: importedAt,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: yahooProviderId,
            slug: "yahoo",
            name: "Yahoo",
            created_at: importedAt,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ player_id: firstPlayerId }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ player_id: secondPlayerId }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await persistProviderSnapshot({
      ...persistInput,
      records: [],
      playerIdentities: [
        {
          externalPlayerId: "primary-unmapped",
          fullName: "Shared Identity",
          position: "WR",
          nflTeam: "NYJ",
          byeWeek: null,
          status: "active",
          aliases: [
            {
              providerSlug: "sleeper",
              providerName: "Sleeper",
              externalId: "sleeper-conflict",
            },
            {
              providerSlug: "yahoo",
              providerName: "Yahoo",
              externalId: "yahoo-conflict",
            },
          ],
          raw: { player: "Shared Identity" },
        },
      ],
    });

    const reviewInserts = client.query.mock.calls.filter((call) =>
      String(call[0]).includes("insert into player_match_reviews"),
    );
    expect(reviewInserts.map((call) => call[1]?.[1])).toEqual([
      "primary-unmapped",
      "sleeper-conflict",
      "yahoo-conflict",
    ]);
  });

  it("queues data records whose provider player ID has no canonical match", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ player_id: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await persistProviderSnapshot(persistInput);

    expect(result).toMatchObject({
      status: "partial",
      unmatchedPlayerCount: 1,
    });
    const reviewInsert = client.query.mock.calls.find((call) =>
      String(call[0]).includes("insert into player_match_reviews"),
    );
    expect(reviewInsert?.[1]?.[1]).toBe("fixture-cmc");
    expect(reviewInsert?.[1]?.[3]).toBe("unmatched");
  });

  it("preserves a known bye week when an identity catalog supplies null", async () => {
    const playerId = "aaaaaaaa-0000-4000-8000-000000000002";
    client.query
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ player_id: playerId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ player_id: playerId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await persistProviderSnapshot({
      ...persistInput,
      records: [],
      playerIdentities: [
        {
          externalPlayerId: "runner-1",
          fullName: "Example Runner",
          position: "RB",
          nflTeam: "SF",
          byeWeek: null,
          status: "active",
          aliases: [],
          raw: { player_id: "runner-1" },
        },
      ],
    });

    const update = client.query.mock.calls.find((call) =>
      String(call[0]).includes("update players"),
    );
    expect(String(update?.[0])).toContain("bye_week = coalesce($5, bye_week)");
    expect(update?.[1]?.[4]).toBeNull();
  });

  it("keeps current canonical metadata during a historical identity load", async () => {
    const playerId = "aaaaaaaa-0000-4000-8000-000000000002";
    client.query
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ player_id: playerId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ player_id: playerId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await persistProviderSnapshot({
      ...persistInput,
      records: [],
      updateCanonicalPlayerMetadata: false,
      playerIdentities: [
        {
          externalPlayerId: "runner-1",
          fullName: "Historical Runner",
          position: "RB",
          nflTeam: "OAK",
          byeWeek: 6,
          status: "inactive",
          aliases: [],
          raw: { season: 2021 },
        },
      ],
    });

    expect(
      client.query.mock.calls.some((call) =>
        String(call[0]).includes("update players"),
      ),
    ).toBe(false);
    expect(
      client.query.mock.calls.some((call) =>
        String(call[0]).includes(
          "insert into provider_player_identity_records",
        ),
      ),
    ).toBe(true);
  });

  it("reuses an existing fingerprint without inserting duplicate records", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await persistProviderSnapshot(persistInput);

    expect(result).toMatchObject({ duplicate: true, recordsImported: 0 });
    expect(client.query.mock.calls).toHaveLength(6);
    expect(
      client.query.mock.calls.some((call) =>
        String(call[0]).includes("insert into provider_data_records"),
      ),
    ).toBe(false);
  });

  it("keeps duplicate identity-only snapshots partial while reviews remain open", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 2 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await persistProviderSnapshot({
      ...persistInput,
      records: [],
      playerIdentities: [],
    });

    expect(result).toMatchObject({
      duplicate: true,
      status: "partial",
      unmatchedPlayerCount: 2,
    });
    expect(String(client.query.mock.calls[3]?.[0])).toContain(
      "review.status = 'open'",
    );
  });

  it("does not count duplicate snapshot rows whose alias is now resolved", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await persistProviderSnapshot(persistInput);

    expect(result).toMatchObject({
      duplicate: true,
      status: "succeeded",
      unmatchedPlayerCount: 0,
    });
    expect(String(client.query.mock.calls[2]?.[0])).toContain("not exists");
    expect(client.query.mock.calls[2]?.[1]).toEqual([snapshotId, providerId]);
  });

  it("marks a failed run without replacing the last successful snapshot", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await failProviderIngestionRun({
      runId,
      providerId,
      staleAfterSeconds: 86_400,
      completedAt: importedAt,
      errorDetails: { kind: "provider_error" },
      recordsReceived: 0,
      playerIdentitiesReceived: 0,
      gamesReceived: 0,
      rejections: [],
    });

    expect(result.status).toBe("failed");
    const stateUpsert = String(client.query.mock.calls[1]?.[0]);
    expect(stateUpsert).toContain(
      "consecutive_failures = provider_ingestion_state.consecutive_failures + 1",
    );
    expect(stateUpsert).not.toContain("latest_snapshot_id =");
    expect(stateUpsert).not.toContain("last_success_at =");
  });

  it("queries all matching records from the freshest snapshot per provider", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          provider_id: providerId,
          provider_slug: "fixture-data",
          snapshot_id: snapshotId,
          adapter_version: "1.0.0",
          season: 2026,
          week: 1,
          observed_at: snapshotRow.observed_at,
          imported_at: importedAt,
          provenance: snapshotRow.provenance,
          player_id: "aaaaaaaa-0000-0000-0000-000000000001",
          external_player_id: "fixture-cmc",
          data_type: "projection",
          record_key: "fixture-cmc:projection",
          normalized_payload: persistInput.records[0]!.normalized,
          raw_payload: persistInput.records[0]!.raw,
        },
      ],
    } as never);

    const records = await listLatestPlayerData({
      playerId: "aaaaaaaa-0000-0000-0000-000000000001",
      dataType: "projection",
      season: 2026,
      week: 1,
    });

    expect(records[0]).toMatchObject({
      providerSlug: "fixture-data",
      snapshotId,
      normalized: { type: "projection", projectedPoints: 21.7 },
    });
    const sql = String(vi.mocked(query).mock.calls[0]?.[0]);
    expect(sql).toContain("with latest_snapshots as");
    expect(sql).toContain("distinct on (s.provider_id)");
    expect(sql).toContain("r.snapshot_id = latest.snapshot_id");
    expect(sql).toContain("coalesce(resolved_identity.player_id, r.player_id)");
  });

  it("queries market trends independently from projection records", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          provider_id: providerId,
          provider_slug: "sleeper",
          snapshot_id: snapshotId,
          adapter_version: "1.0.0",
          season: 2026,
          week: 1,
          observed_at: snapshotRow.observed_at,
          imported_at: importedAt,
          provenance: snapshotRow.provenance,
          player_id: "aaaaaaaa-0000-0000-0000-000000000001",
          external_player_id: "4034",
          data_type: "market_trend",
          record_key: "4034:market-trend:add:24h",
          normalized_payload: {
            type: "market_trend",
            metrics: { adds: 120 },
            direction: "rising",
          },
          raw_payload: { player_id: "4034", count: 120 },
        },
      ],
    } as never);

    const trends = await listLatestMarketTrends({ season: 2026, week: 1 });

    expect(trends[0]).toMatchObject({
      providerSlug: "sleeper",
      dataType: "market_trend",
      normalized: { direction: "rising" },
    });
    expect(String(vi.mocked(query).mock.calls[0]?.[0])).toContain(
      "r.data_type = 'market_trend'",
    );
    expect(String(vi.mocked(query).mock.calls[0]?.[0])).toContain(
      "coalesce(resolved_identity.player_id, r.player_id)",
    );
  });

  it("queries games from the freshest provider snapshot by season/week", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          provider_id: providerId,
          provider_slug: "nflverse",
          snapshot_id: snapshotId,
          adapter_version: "1.0.0",
          observed_at: snapshotRow.observed_at,
          imported_at: importedAt,
          provenance: snapshotRow.provenance,
          external_game_id: "2026_01_SF_SEA",
          season: 2026,
          week: 1,
          season_type: "REG",
          kickoff_at: new Date("2026-09-13T20:25:00.000Z"),
          home_team: "SEA",
          away_team: "SF",
          home_score: null,
          away_score: null,
          neutral_site: false,
          raw_payload: { game_id: "2026_01_SF_SEA" },
        },
      ],
    } as never);

    const games = await listLatestGames({ season: 2026, week: 1 });

    expect(games[0]).toMatchObject({
      providerSlug: "nflverse",
      externalGameId: "2026_01_SF_SEA",
      homeTeam: "SEA",
      awayTeam: "SF",
    });
    expect(String(vi.mocked(query).mock.calls[0]?.[0])).toContain(
      "g.season = $1 and g.week = $2",
    );
  });
});
