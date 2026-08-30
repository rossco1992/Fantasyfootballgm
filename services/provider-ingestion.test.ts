import { describe, expect, it } from "vitest";

import type {
  FailedProviderIngestionInput,
  PersistProviderSnapshotInput,
  ProviderIngestionHealth,
  ProviderIngestionResult,
  StartedProviderIngestionRun,
} from "@/db/repositories/provider-ingestion";
import type {
  JsonValue,
  ProviderDescriptor,
  ProviderIngestionRequest,
  ProviderSnapshotCandidate,
} from "@/domain/fantasy-data";
import {
  FixtureProviderAdapter,
  type FixtureProviderPayload,
} from "@/providers/fixture/fixture-provider-adapter";
import type { FantasyDataProviderAdapter } from "@/providers/types";
import {
  ingestProviderData,
  retrieveProviderFreshness,
  runOnDemandProviderIngestion,
  type ProviderIngestionStore,
} from "@/services/provider-ingestion";

const PROVIDER_ID = "11111111-1111-4111-8111-111111111111";
const SNAPSHOT_ID = "22222222-2222-4222-8222-222222222222";

class MemoryIngestionStore implements ProviderIngestionStore {
  readonly starts: ProviderIngestionRequest[] = [];
  readonly snapshots = new Map<string, string>();
  health: ProviderIngestionHealth | null = null;
  lastPersisted: PersistProviderSnapshotInput | null = null;
  private runNumber = 0;

  async startRun(
    descriptor: ProviderDescriptor,
    request: ProviderIngestionRequest,
    startedAt: Date,
  ): Promise<StartedProviderIngestionRun> {
    this.starts.push(request);
    this.runNumber += 1;
    this.health = {
      providerId: PROVIDER_ID,
      providerSlug: descriptor.slug,
      lastAttemptAt: startedAt,
      lastSuccessAt: this.health?.lastSuccessAt ?? null,
      latestSnapshotId: this.health?.latestSnapshotId ?? null,
      lastStatus: "running",
      staleAfterSeconds: descriptor.staleAfterSeconds,
      consecutiveFailures: this.health?.consecutiveFailures ?? 0,
      lastError: this.health?.lastError ?? null,
      updatedAt: startedAt,
    };
    return {
      id: `00000000-0000-4000-8000-${String(this.runNumber).padStart(12, "0")}`,
      providerId: PROVIDER_ID,
    };
  }

  async persistSnapshot(
    input: PersistProviderSnapshotInput,
  ): Promise<ProviderIngestionResult> {
    this.lastPersisted = input;
    const existing = this.snapshots.get(input.sourceFingerprint);
    const snapshotId = existing ?? SNAPSHOT_ID;
    if (!existing) this.snapshots.set(input.sourceFingerprint, snapshotId);
    const coverageGaps = (input.snapshot.provenance.coverage ?? [])
      .filter((coverage) => coverage.status === "unavailable")
      .map((coverage) => coverage.dataset);
    const status =
      input.rejections.length > 0 || coverageGaps.length > 0
        ? "partial"
        : "succeeded";
    this.health = {
      providerId: input.providerId,
      providerSlug: input.descriptor.slug,
      lastAttemptAt: input.importedAt,
      lastSuccessAt: input.importedAt,
      latestSnapshotId: snapshotId,
      lastStatus: status,
      staleAfterSeconds: input.descriptor.staleAfterSeconds,
      consecutiveFailures: 0,
      lastError:
        status === "partial"
          ? { rejectedRecords: input.rejections.length }
          : null,
      updatedAt: input.importedAt,
    };
    return {
      runId: input.runId,
      snapshotId,
      status,
      duplicate: existing !== undefined,
      recordsReceived: input.records.length + input.rejections.length,
      recordsImported: existing ? 0 : input.records.length,
      recordsRejected: input.rejections.length,
      unmatchedPlayerCount: 0,
      playerIdentitiesReceived: input.playerIdentities.length,
      playerIdentitiesImported: existing ? 0 : input.playerIdentities.length,
      gamesReceived: input.games.length,
      gamesImported: existing ? 0 : input.games.length,
      coverageGaps,
    };
  }

  async failRun(
    input: FailedProviderIngestionInput,
  ): Promise<ProviderIngestionResult> {
    const previous = this.health;
    this.health = {
      providerId: input.providerId,
      providerSlug: previous?.providerSlug ?? "fixture-data",
      lastAttemptAt: input.completedAt,
      lastSuccessAt: previous?.lastSuccessAt ?? null,
      latestSnapshotId: previous?.latestSnapshotId ?? null,
      lastStatus: "failed",
      staleAfterSeconds: input.staleAfterSeconds,
      consecutiveFailures: (previous?.consecutiveFailures ?? 0) + 1,
      lastError: input.errorDetails,
      updatedAt: input.completedAt,
    };
    return {
      runId: input.runId,
      snapshotId: null,
      status: "failed",
      duplicate: false,
      recordsReceived: input.recordsReceived,
      recordsImported: 0,
      recordsRejected: input.rejections.length,
      unmatchedPlayerCount: 0,
      playerIdentitiesReceived: input.playerIdentitiesReceived,
      playerIdentitiesImported: 0,
      gamesReceived: input.gamesReceived,
      gamesImported: 0,
      coverageGaps: [],
    };
  }

  async getHealth(): Promise<ProviderIngestionHealth | null> {
    return this.health;
  }
}

function clock(...values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]!);
}

describe("provider ingestion service", () => {
  it("ingests the fixture end to end through the on-demand contract", async () => {
    const store = new MemoryIngestionStore();
    const result = await runOnDemandProviderIngestion(
      new FixtureProviderAdapter(),
      { season: 2026, week: 1 },
      {
        store,
        clock: clock("2026-08-20T12:01:00.000Z", "2026-08-20T12:01:01.000Z"),
      },
    );

    expect(result).toMatchObject({
      status: "succeeded",
      duplicate: false,
      recordsReceived: 15,
      recordsImported: 15,
      recordsRejected: 0,
    });
    expect(store.starts[0]?.trigger).toBe("on_demand");
    expect(store.snapshots.size).toBe(1);
  });

  it("does not duplicate a snapshot when the same source response is re-run", async () => {
    const store = new MemoryIngestionStore();
    const adapter = new FixtureProviderAdapter();
    const first = await ingestProviderData(
      adapter,
      { trigger: "on_demand", season: 2026, week: 1 },
      { store },
    );
    const second = await ingestProviderData(
      adapter,
      { trigger: "on_demand", season: 2026, week: 1 },
      { store },
    );

    expect(first.duplicate).toBe(false);
    expect(second).toMatchObject({ duplicate: true, recordsImported: 0 });
    expect(second.snapshotId).toBe(first.snapshotId);
    expect(store.snapshots.size).toBe(1);
  });

  it("persists valid records and surfaces invalid records as a partial import", async () => {
    const store = new MemoryIngestionStore();
    class PartiallyInvalidAdapter extends FixtureProviderAdapter {
      override normalize(
        payload: FixtureProviderPayload,
        request: ProviderIngestionRequest,
      ): ProviderSnapshotCandidate {
        const snapshot = super.normalize(payload, request);
        (snapshot.records as unknown[]).push({
          recordKey: "invalid-ranking",
          externalPlayerId: "fixture-cmc",
          raw: { rank: 0 },
          normalized: {
            type: "ranking",
            rank: 0,
            positionRank: null,
            tier: null,
            expertCount: null,
          },
        });
        return snapshot;
      }
    }

    const result = await ingestProviderData(
      new PartiallyInvalidAdapter(),
      { trigger: "scheduled", season: 2026, week: 1 },
      { store },
    );

    expect(result).toMatchObject({
      status: "partial",
      recordsReceived: 16,
      recordsImported: 15,
      recordsRejected: 1,
    });
  });

  it("validates identity/game records and surfaces source coverage gaps", async () => {
    const store = new MemoryIngestionStore();
    class HistoricalAdapter extends FixtureProviderAdapter {
      override normalize(
        payload: FixtureProviderPayload,
        request: ProviderIngestionRequest,
      ): ProviderSnapshotCandidate {
        const snapshot = super.normalize(payload, request);
        return {
          ...snapshot,
          provenance: {
            ...(snapshot.provenance as Record<string, unknown>),
            coverage: [
              {
                dataset: "play_by_play_participation",
                status: "unavailable",
                recordCount: 0,
                sourceUrl: "https://example.test/participation.csv",
                observedAt: null,
                detail: "not published",
              },
            ],
          },
          players: [
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
              raw: { source: "roster" },
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
        };
      }
    }

    const result = await ingestProviderData(
      new HistoricalAdapter(),
      { trigger: "scheduled", season: 2026, week: 1 },
      { store },
    );

    expect(result).toMatchObject({
      status: "partial",
      playerIdentitiesReceived: 1,
      gamesReceived: 1,
      coverageGaps: ["play_by_play_participation"],
      error: {
        kind: "partial_import",
        coverageGaps: ["play_by_play_participation"],
      },
    });
    expect(store.lastPersisted?.playerIdentities).toHaveLength(1);
    expect(store.lastPersisted?.games).toHaveLength(1);
  });

  it("keeps the last successful snapshot when a later provider attempt fails", async () => {
    const store = new MemoryIngestionStore();
    await ingestProviderData(
      new FixtureProviderAdapter(),
      { trigger: "scheduled", season: 2026, week: 1 },
      {
        store,
        clock: clock("2026-08-20T12:00:00.000Z", "2026-08-20T12:00:01.000Z"),
      },
    );
    const validSnapshotId = store.health?.latestSnapshotId;
    const validSuccessAt = store.health?.lastSuccessAt;

    const failingAdapter: FantasyDataProviderAdapter<JsonValue> = {
      descriptor: new FixtureProviderAdapter().descriptor,
      async fetch() {
        throw new Error("Provider unavailable");
      },
      normalize() {
        throw new Error("unreachable");
      },
    };
    const failed = await ingestProviderData(
      failingAdapter,
      { trigger: "scheduled", season: 2026, week: 1 },
      {
        store,
        clock: clock("2026-08-20T13:00:00.000Z", "2026-08-20T13:00:01.000Z"),
      },
    );

    expect(failed.status).toBe("failed");
    expect(store.health).toMatchObject({
      lastStatus: "failed",
      latestSnapshotId: validSnapshotId,
      lastSuccessAt: validSuccessAt,
      consecutiveFailures: 1,
    });
  });

  it("records a persistence failure instead of leaving the run in progress", async () => {
    class PersistenceFailureStore extends MemoryIngestionStore {
      override async persistSnapshot(): Promise<ProviderIngestionResult> {
        throw new Error("Database unavailable");
      }
    }
    const store = new PersistenceFailureStore();

    const failed = await ingestProviderData(
      new FixtureProviderAdapter(),
      { trigger: "scheduled", season: 2026, week: 1 },
      {
        store,
        clock: clock(
          "2026-08-20T12:00:00.000Z",
          "2026-08-20T12:00:01.000Z",
          "2026-08-20T12:00:02.000Z",
        ),
      },
    );

    expect(failed).toMatchObject({
      status: "failed",
      error: { kind: "persistence_error", message: "Database unavailable" },
    });
    expect(store.health).toMatchObject({
      lastStatus: "failed",
      latestSnapshotId: null,
      consecutiveFailures: 1,
    });
  });

  it("calculates provider staleness from the last successful refresh", async () => {
    const store = new MemoryIngestionStore();
    await ingestProviderData(
      new FixtureProviderAdapter(),
      { trigger: "scheduled", season: 2026, week: 1 },
      {
        store,
        clock: clock("2026-08-20T12:00:00.000Z", "2026-08-20T12:00:01.000Z"),
      },
    );

    const fresh = await retrieveProviderFreshness("fixture-data", {
      store,
      clock: () => new Date("2026-08-20T13:00:00.000Z"),
    });
    const stale = await retrieveProviderFreshness("fixture-data", {
      store,
      clock: () => new Date("2026-08-22T13:00:00.000Z"),
    });

    expect(fresh?.isStale).toBe(false);
    expect(stale?.isStale).toBe(true);
  });
});
