import { describe, expect, it } from "vitest";

import type {
  LatestProjectionSourceRecord,
  PersistConsensusSnapshotInput,
  PersistedConsensusSnapshot,
  ProjectionOutcomeEvaluationInput,
} from "@/db/repositories/projection-consensus";
import type { LeagueConfiguration } from "@/domain/league-configuration";
import {
  evaluateProjectionConsensusSnapshot,
  generateProjectionConsensus,
  type ProjectionConsensusStore,
} from "@/services/projection-consensus";

const LEAGUE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PLAYER_ID = "33333333-3333-4333-8333-333333333333";
const CONSENSUS_ID = "44444444-4444-4444-8444-444444444444";
const ENTRY_ID = "55555555-5555-4555-8555-555555555555";

const league: LeagueConfiguration = {
  id: LEAGUE_ID,
  userId: USER_ID,
  name: "Test League",
  teamCount: 12,
  leagueFormat: "redraft",
  maxKeepersPerTeam: 0,
  draftType: "snake",
  draftPosition: 4,
  scoringPreset: "ppr",
  rosterSlots: {
    qb: 1,
    rb: 2,
    wr: 2,
    te: 1,
    flex: 1,
    superflex: 0,
    k: 1,
    dst: 1,
    bench: 6,
  },
  createdAt: new Date("2026-08-20T00:00:00.000Z"),
  updatedAt: new Date("2026-08-20T00:00:00.000Z"),
};

function source(
  providerSlug: string,
  snapshotId: string,
  observedAt: string,
  projectedPoints: number,
): LatestProjectionSourceRecord {
  return {
    providerId:
      providerSlug === "fantasypros"
        ? "66666666-6666-4666-8666-666666666666"
        : providerSlug === "fantasypros-csv"
          ? "77777777-7777-4777-8777-777777777777"
          : "88888888-8888-4888-8888-888888888888",
    providerSlug,
    snapshotId,
    observedAt: new Date(observedAt),
    playerId: PLAYER_ID,
    position: "WR",
    scoring: "ppr",
    projectedPoints,
    stats: {},
  };
}

class MemoryConsensusStore implements ProjectionConsensusStore {
  readonly persistedInputs: PersistConsensusSnapshotInput[] = [];
  readonly evaluations: ProjectionOutcomeEvaluationInput[] = [];
  snapshot: PersistedConsensusSnapshot | null = null;

  constructor(readonly sources: LatestProjectionSourceRecord[]) {}

  async listSources() {
    return this.sources;
  }

  async persistSnapshot(input: PersistConsensusSnapshotInput) {
    this.persistedInputs.push(input);
    this.snapshot = {
      id: CONSENSUS_ID,
      leagueConfigurationId: input.leagueConfigurationId,
      season: input.season,
      week: input.week,
      horizon: input.horizon,
      scoring: input.scoring,
      weightingConfig: input.weightingConfig,
      weightingVersion: input.weightingConfig.version,
      calculationVersion: input.calculationVersion,
      sourceSnapshotIds: input.sourceSnapshotIds,
      inputFingerprint: input.inputFingerprint,
      generatedAt: input.generatedAt,
      entries: input.entries.map((entry) => ({
        ...entry,
        id: ENTRY_ID,
        consensusSnapshotId: CONSENSUS_ID,
      })),
    };
    return this.snapshot;
  }

  async getSnapshot() {
    return this.snapshot;
  }

  async persistOutcomeEvaluation(input: ProjectionOutcomeEvaluationInput) {
    this.evaluations.push(input);
  }

  async listAccuracySummary() {
    return [];
  }
}

const retrieveLeague = async () => league;

describe("projection consensus service", () => {
  it("uses the freshest API/CSV source in a provider family and records inputs", async () => {
    const store = new MemoryConsensusStore([
      source(
        "fantasypros",
        "99999999-9999-4999-8999-999999999999",
        "2026-08-28T12:00:00.000Z",
        18,
      ),
      source(
        "fantasypros-csv-a1b2c3d4e5f6",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "2026-08-29T12:00:00.000Z",
        20,
      ),
      source(
        "fantasynerds",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "2026-08-29T11:00:00.000Z",
        24,
      ),
    ]);

    const result = await generateProjectionConsensus(
      {
        leagueId: LEAGUE_ID,
        userId: USER_ID,
        season: 2026,
        week: null,
      },
      {
        store,
        retrieveLeague,
        clock: () => new Date("2026-08-29T13:00:00.000Z"),
      },
    );

    expect(result.entries[0]).toMatchObject({
      consensusPoints: 22,
      lowPoints: 20,
      highPoints: 24,
      sourceCount: 2,
      groupCount: 1,
    });
    expect(
      result.entries[0]?.components.map((component) => component.providerSlug),
    ).toEqual(["fantasynerds", "fantasypros-csv-a1b2c3d4e5f6"]);
    expect(result.sourceSnapshotIds).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ]);
    expect(result.inputFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.weightingVersion).toBe("equal-provider-families-v1");
  });

  it("produces the same fingerprint when the same draft inputs are replayed", async () => {
    const store = new MemoryConsensusStore([
      source(
        "fantasypros",
        "99999999-9999-4999-8999-999999999999",
        "2026-08-29T12:00:00.000Z",
        20,
      ),
    ]);

    await generateProjectionConsensus(
      { leagueId: LEAGUE_ID, userId: USER_ID, season: 2026, week: null },
      { store, retrieveLeague, clock: () => new Date("2026-08-29T13:00:00Z") },
    );
    await generateProjectionConsensus(
      { leagueId: LEAGUE_ID, userId: USER_ID, season: 2026, week: null },
      { store, retrieveLeague, clock: () => new Date("2026-08-30T13:00:00Z") },
    );

    expect(store.persistedInputs[0]?.inputFingerprint).toBe(
      store.persistedInputs[1]?.inputFingerprint,
    );
  });

  it("evaluates the frozen consensus and every contributing provider", async () => {
    const store = new MemoryConsensusStore([
      source(
        "fantasypros",
        "99999999-9999-4999-8999-999999999999",
        "2026-08-29T12:00:00.000Z",
        20,
      ),
      source(
        "fantasynerds",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "2026-08-29T12:00:00.000Z",
        24,
      ),
    ]);
    await generateProjectionConsensus(
      { leagueId: LEAGUE_ID, userId: USER_ID, season: 2026, week: 1 },
      { store, retrieveLeague },
    );

    const result = await evaluateProjectionConsensusSnapshot(
      {
        snapshotId: CONSENSUS_ID,
        outcomes: [
          {
            playerId: PLAYER_ID,
            stats: { receptions: 5, receivingYards: 50 },
            source: "nflverse",
            observedAt: new Date("2026-09-14T12:00:00.000Z"),
          },
        ],
      },
      {
        store,
        clock: () => new Date("2026-09-14T13:00:00.000Z"),
      },
    );

    expect(result).toEqual({ evaluatedPlayers: 1 });
    expect(store.evaluations[0]).toMatchObject({
      consensusSnapshotId: CONSENSUS_ID,
      consensusEntryId: ENTRY_ID,
      actualPoints: 10,
      source: "nflverse",
    });
    expect(store.evaluations[0]?.accuracy).toHaveLength(3);
  });
});
