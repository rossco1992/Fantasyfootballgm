import { beforeEach, describe, expect, it, vi } from "vitest";

import { query, withTransaction } from "@/db/client";
import {
  getLatestConsensusSnapshotForLeague,
  listLatestProjectionSources,
  listProjectionAccuracySummary,
  persistConsensusSnapshot,
  type PersistConsensusSnapshotInput,
} from "@/db/repositories/projection-consensus";

vi.mock("@/db/client", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

const LEAGUE_ID = "11111111-1111-4111-8111-111111111111";
const PLAYER_ID = "22222222-2222-4222-8222-222222222222";
const PROVIDER_ID = "33333333-3333-4333-8333-333333333333";
const PROVIDER_SNAPSHOT_ID = "44444444-4444-4444-8444-444444444444";
const CONSENSUS_ID = "55555555-5555-4555-8555-555555555555";
const ENTRY_ID = "66666666-6666-4666-8666-666666666666";
const generatedAt = new Date("2026-08-29T12:00:00.000Z");

const component = {
  providerId: PROVIDER_ID,
  providerSlug: "fantasypros",
  snapshotId: PROVIDER_SNAPSHOT_ID,
  observedAt: generatedAt,
  sourceFamily: "fantasypros",
  correlationGroup: "expert-consensus",
  configuredWeight: 1,
  effectiveWeight: 1,
  projectedPoints: 250,
  pointsOrigin: "provider_total" as const,
  scoredStats: [],
};

const persistInput: PersistConsensusSnapshotInput = {
  leagueConfigurationId: LEAGUE_ID,
  season: 2026,
  week: null,
  horizon: "preseason",
  scoring: "ppr",
  weightingConfig: {
    version: "weights-v1",
    providers: {
      fantasypros: {
        weight: 1,
        sourceFamily: "fantasypros",
        correlationGroup: "expert-consensus",
      },
    },
  },
  calculationVersion: "calculation-v1",
  sourceSnapshotIds: [PROVIDER_SNAPSHOT_ID],
  inputFingerprint: "a".repeat(64),
  generatedAt,
  entries: [
    {
      playerId: PLAYER_ID,
      position: "WR",
      consensusPoints: 250,
      lowPoints: 250,
      highPoints: 250,
      rangePoints: 0,
      standardDeviation: 0,
      confidence: 0.8,
      sourceCount: 1,
      groupCount: 1,
      components: [component],
    },
  ],
};

const snapshotRow = {
  id: CONSENSUS_ID,
  league_configuration_id: LEAGUE_ID,
  season: 2026,
  week: null,
  horizon: "preseason",
  scoring: "ppr",
  weighting_version: "weights-v1",
  calculation_version: "calculation-v1",
  weighting_config: persistInput.weightingConfig,
  source_snapshot_ids: [PROVIDER_SNAPSHOT_ID],
  input_fingerprint: "a".repeat(64),
  generated_at: generatedAt,
};

const entryRow = {
  id: ENTRY_ID,
  consensus_snapshot_id: CONSENSUS_ID,
  player_id: PLAYER_ID,
  position: "WR",
  consensus_points: "250.0000",
  low_points: "250.0000",
  high_points: "250.0000",
  range_points: "0.0000",
  standard_deviation: "0.0000",
  confidence: "0.8000",
  source_count: 1,
  group_count: 1,
  components: [
    { ...component, observedAt: component.observedAt.toISOString() },
  ],
};

describe("projection consensus repository", () => {
  const client = { query: vi.fn() };

  beforeEach(() => {
    vi.mocked(query).mockReset();
    client.query.mockReset();
    vi.mocked(withTransaction).mockReset();
    vi.mocked(withTransaction).mockImplementation(async (work) =>
      work(client as never),
    );
  });

  it("reads only normalized projections from the latest provider snapshots", async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        {
          provider_id: PROVIDER_ID,
          provider_slug: "fantasypros",
          snapshot_id: PROVIDER_SNAPSHOT_ID,
          observed_at: generatedAt,
          player_id: PLAYER_ID,
          position: "WR",
          normalized_payload: {
            type: "projection",
            scoring: "ppr",
            projectedPoints: 250,
            stats: { receivingYards: 1200 },
          },
        },
      ],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    });

    await expect(
      listLatestProjectionSources({ season: 2026, week: null }),
    ).resolves.toEqual([
      {
        providerId: PROVIDER_ID,
        providerSlug: "fantasypros",
        snapshotId: PROVIDER_SNAPSHOT_ID,
        observedAt: generatedAt,
        playerId: PLAYER_ID,
        position: "WR",
        scoring: "ppr",
        projectedPoints: 250,
        stats: { receivingYards: 1200 },
      },
    ]);
    expect(vi.mocked(query).mock.calls[0]?.[0]).toContain(
      "distinct on (snapshot.provider_id)",
    );
  });

  it("persists the weighting version and traceable player components", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [entryRow], rowCount: 1 });

    const result = await persistConsensusSnapshot(persistInput);

    expect(result).toMatchObject({
      id: CONSENSUS_ID,
      weightingVersion: "weights-v1",
      calculationVersion: "calculation-v1",
      entries: [
        {
          id: ENTRY_ID,
          consensusPoints: 250,
          confidence: 0.8,
        },
      ],
    });
    const entryInsert = client.query.mock.calls[1];
    expect(entryInsert?.[0]).toContain("projection_consensus_entries");
    expect(entryInsert?.[1]?.[11]).toContain('"providerSlug":"fantasypros"');
  });

  it("loads the latest preseason consensus for a league", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [snapshotRow],
        rowCount: 1,
        command: "SELECT",
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [entryRow],
        rowCount: 1,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

    await expect(
      getLatestConsensusSnapshotForLeague({
        leagueConfigurationId: LEAGUE_ID,
        season: 2026,
        week: null,
        horizon: "preseason",
      }),
    ).resolves.toMatchObject({
      id: CONSENSUS_ID,
      entries: [{ playerId: PLAYER_ID, consensusPoints: 250 }],
    });
    expect(vi.mocked(query).mock.calls[0]?.[0]).toContain(
      "order by generated_at desc",
    );
  });

  it("summarizes immutable errors by position and horizon", async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        {
          position: "WR",
          horizon: "weekly",
          source_type: "consensus",
          provider_slug: null,
          sample_size: 12,
          mean_absolute_error: "2.5",
          root_mean_squared_error: "3.2",
          mean_signed_error: "-0.4",
        },
      ],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    });

    await expect(
      listProjectionAccuracySummary({ season: 2026 }),
    ).resolves.toEqual([
      {
        position: "WR",
        horizon: "weekly",
        sourceType: "consensus",
        providerSlug: null,
        sampleSize: 12,
        meanAbsoluteError: 2.5,
        rootMeanSquaredError: 3.2,
        meanSignedError: -0.4,
      },
    ]);
  });
});
