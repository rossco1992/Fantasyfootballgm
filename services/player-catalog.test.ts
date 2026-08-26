import { beforeEach, describe, expect, it, vi } from "vitest";

import { countDraftablePlayers } from "@/db/repositories/players";
import {
  retrieveProviderFreshness,
  runOnDemandProviderIngestion,
} from "@/services/provider-ingestion";
import {
  refreshSleeperPlayerCatalog,
  retrievePlayerCatalogSummary,
} from "@/services/player-catalog";

vi.mock("@/db/repositories/players", () => ({
  countDraftablePlayers: vi.fn(),
}));

vi.mock("@/services/provider-ingestion", () => ({
  retrieveProviderFreshness: vi.fn(),
  runOnDemandProviderIngestion: vi.fn(),
}));

const fresh = {
  providerId: "11111111-1111-4111-8111-111111111111",
  providerSlug: "sleeper-player-catalog",
  lastAttemptAt: new Date("2026-08-26T00:00:00.000Z"),
  lastSuccessAt: new Date("2026-08-26T00:00:00.000Z"),
  latestSnapshotId: "22222222-2222-4222-8222-222222222222",
  lastStatus: "succeeded" as const,
  staleAfterSeconds: 86_400,
  consecutiveFailures: 0,
  lastError: null,
  updatedAt: new Date("2026-08-26T00:00:00.000Z"),
  isStale: false,
};

describe("player catalog service", () => {
  beforeEach(() => {
    vi.mocked(retrieveProviderFreshness).mockReset();
    vi.mocked(runOnDemandProviderIngestion).mockReset();
    vi.mocked(countDraftablePlayers).mockReset();
  });

  it("does not call Sleeper more than once while the daily catalog is fresh", async () => {
    vi.mocked(retrieveProviderFreshness).mockResolvedValue(fresh);

    await expect(refreshSleeperPlayerCatalog(2026)).resolves.toMatchObject({
      kind: "skipped",
      reason: "fresh",
    });
    expect(runOnDemandProviderIngestion).not.toHaveBeenCalled();
  });

  it("refreshes a missing or stale catalog through the shared ingestion service", async () => {
    vi.mocked(retrieveProviderFreshness).mockResolvedValue(null);
    vi.mocked(runOnDemandProviderIngestion).mockResolvedValue({
      runId: "11111111-1111-4111-8111-111111111111",
      snapshotId: "22222222-2222-4222-8222-222222222222",
      status: "succeeded",
      duplicate: false,
      recordsReceived: 0,
      recordsImported: 0,
      recordsRejected: 0,
      unmatchedPlayerCount: 0,
      playerIdentitiesReceived: 642,
      playerIdentitiesImported: 642,
      gamesReceived: 0,
      gamesImported: 0,
      coverageGaps: [],
      error: null,
    });

    const result = await refreshSleeperPlayerCatalog(2026);

    expect(result).toMatchObject({
      kind: "refreshed",
      outcome: { playerIdentitiesImported: 642 },
    });
    expect(runOnDemandProviderIngestion).toHaveBeenCalledWith(
      expect.anything(),
      { season: 2026, week: null },
      expect.anything(),
    );
  });

  it("returns player count and provider freshness for the draft board", async () => {
    vi.mocked(countDraftablePlayers).mockResolvedValue(642);
    vi.mocked(retrieveProviderFreshness).mockResolvedValue(fresh);

    await expect(retrievePlayerCatalogSummary()).resolves.toEqual({
      playerCount: 642,
      freshness: fresh,
    });
  });
});
