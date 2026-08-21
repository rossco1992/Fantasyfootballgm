import { describe, expect, it } from "vitest";

import type {
  FailedProviderIngestionInput,
  PersistProviderSnapshotInput,
  ProviderIngestionHealth,
  ProviderIngestionResult,
  StartedProviderIngestionRun,
} from "@/db/repositories/provider-ingestion";
import type {
  ProviderDescriptor,
  ProviderSnapshotCandidate,
} from "@/domain/fantasy-data";
import type { NflversePayload } from "@/providers/nflverse/nflverse-provider-adapter";
import type { SleeperTrendingPayload } from "@/providers/sleeper/sleeper-trending-adapter";
import type { FantasyDataProviderAdapter } from "@/providers/types";
import { refreshHistoricalContext } from "@/services/historical-context";
import type { ProviderIngestionStore } from "@/services/provider-ingestion";

class OrderedStore implements ProviderIngestionStore {
  readonly providers: string[] = [];
  private run = 0;

  async startRun(
    descriptor: ProviderDescriptor,
  ): Promise<StartedProviderIngestionRun> {
    this.providers.push(descriptor.slug);
    this.run += 1;
    return {
      id: `00000000-0000-4000-8000-${String(this.run).padStart(12, "0")}`,
      providerId: `10000000-0000-4000-8000-${String(this.run).padStart(12, "0")}`,
    };
  }

  async persistSnapshot(
    input: PersistProviderSnapshotInput,
  ): Promise<ProviderIngestionResult> {
    const coverageGaps = (input.snapshot.provenance.coverage ?? [])
      .filter((entry) => entry.status === "unavailable")
      .map((entry) => entry.dataset);
    return {
      runId: input.runId,
      snapshotId: "20000000-0000-4000-8000-000000000001",
      status: coverageGaps.length > 0 ? "partial" : "succeeded",
      duplicate: false,
      recordsReceived: input.records.length,
      recordsImported: input.records.length,
      recordsRejected: input.rejections.length,
      unmatchedPlayerCount: 0,
      playerIdentitiesReceived: input.playerIdentities.length,
      playerIdentitiesImported: input.playerIdentities.length,
      gamesReceived: input.games.length,
      gamesImported: input.games.length,
      coverageGaps,
    };
  }

  async failRun(
    input: FailedProviderIngestionInput,
  ): Promise<ProviderIngestionResult> {
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
    return null;
  }
}

function adapter<T>(
  descriptor: ProviderDescriptor,
  candidate: ProviderSnapshotCandidate,
): FantasyDataProviderAdapter<T> {
  return {
    descriptor,
    async fetch() {
      return {} as T;
    },
    normalize() {
      return candidate;
    },
  };
}

describe("historical-context refresh", () => {
  it("runs nflverse before Sleeper and summarizes degraded component coverage", async () => {
    const store = new OrderedStore();
    const base = {
      season: 2026,
      week: 1,
      observedAt: "2026-09-14T12:00:00.000Z",
      records: [],
    };
    const nflverse = adapter<NflversePayload>(
      {
        slug: "nflverse",
        name: "nflverse",
        adapterVersion: "test",
        staleAfterSeconds: 3_600,
      },
      {
        ...base,
        provenance: {
          source: "nflverse",
          sourceId: "week-1",
          sourceUrl: null,
          notes: [],
        },
      },
    );
    const sleeper = adapter<SleeperTrendingPayload>(
      {
        slug: "sleeper",
        name: "Sleeper",
        adapterVersion: "test",
        staleAfterSeconds: 3_600,
      },
      {
        ...base,
        provenance: {
          source: "Sleeper",
          sourceId: "week-1",
          sourceUrl: null,
          notes: [],
          coverage: [
            {
              dataset: "sleeper_drop_trends",
              status: "unavailable",
              recordCount: 0,
              sourceUrl: "https://example.test/drops",
              observedAt: null,
              detail: "offline",
            },
          ],
        },
      },
    );

    const result = await refreshHistoricalContext(
      { season: 2026, week: 1 },
      "scheduled",
      {
        nflverseAdapter: nflverse,
        sleeperAdapter: sleeper,
        ingestion: { store },
      },
    );

    expect(store.providers).toEqual(["nflverse", "sleeper"]);
    expect(result).toMatchObject({
      status: "partial",
      nflverse: { status: "succeeded" },
      sleeper: {
        status: "partial",
        coverageGaps: ["sleeper_drop_trends"],
      },
    });
  });
});
