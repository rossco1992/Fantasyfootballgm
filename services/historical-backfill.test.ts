import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  hasCompletedHistoricalScope,
  listHistoricalBackfillScopes,
} from "@/db/repositories/historical-backfill";
import {
  backfillNflverseHistory,
  retrieveHistoricalBackfillSummary,
} from "@/services/historical-backfill";
import {
  runOnDemandProviderIngestion,
  runScheduledProviderIngestion,
} from "@/services/provider-ingestion";

vi.mock("@/db/repositories/historical-backfill", () => ({
  hasCompletedHistoricalScope: vi.fn(),
  listHistoricalBackfillScopes: vi.fn(),
}));
vi.mock("@/services/provider-ingestion", () => ({
  runOnDemandProviderIngestion: vi.fn(),
  runScheduledProviderIngestion: vi.fn(),
}));

const outcome = {
  runId: "11111111-1111-4111-8111-111111111111",
  snapshotId: "22222222-2222-4222-8222-222222222222",
  status: "succeeded" as const,
  duplicate: false,
  recordsReceived: 10,
  recordsImported: 10,
  recordsRejected: 0,
  unmatchedPlayerCount: 0,
  playerIdentitiesReceived: 5,
  playerIdentitiesImported: 5,
  gamesReceived: 1,
  gamesImported: 1,
  coverageGaps: [],
  error: null,
};
const lock = async <T>(_key: string, operation: () => Promise<T>) =>
  operation();

describe("historical backfill service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasCompletedHistoricalScope).mockResolvedValue(false);
    vi.mocked(runOnDemandProviderIngestion).mockResolvedValue(outcome);
    vi.mocked(runScheduledProviderIngestion).mockResolvedValue(outcome);
  });

  it("skips successful scopes and loads only missing weeks", async () => {
    vi.mocked(hasCompletedHistoricalScope)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await backfillNflverseHistory(
      { season: 2025, startWeek: 1, endWeek: 2, force: false },
      "on_demand",
      { latestSeason: 2025, lock },
    );

    expect(result).toMatchObject({
      status: "succeeded",
      skipped: 1,
      succeeded: 1,
    });
    expect(runOnDemandProviderIngestion).toHaveBeenCalledOnce();
    expect(runOnDemandProviderIngestion).toHaveBeenCalledWith(
      expect.anything(),
      { season: 2025, week: 2 },
      expect.objectContaining({ updateCanonicalPlayerMetadata: false }),
    );
  });

  it("retries every requested scope when refresh is forced", async () => {
    vi.mocked(hasCompletedHistoricalScope).mockResolvedValue(true);
    await backfillNflverseHistory(
      { season: 2025, startWeek: 1, endWeek: 2, force: true },
      "scheduled",
      { latestSeason: 2025, lock },
    );
    expect(hasCompletedHistoricalScope).not.toHaveBeenCalled();
    expect(runScheduledProviderIngestion).toHaveBeenCalledTimes(2);
  });

  it("summarizes missing and persisted coverage for the dashboard", async () => {
    vi.mocked(listHistoricalBackfillScopes).mockResolvedValue([
      {
        runId: "11111111-1111-4111-8111-111111111111",
        season: 2025,
        week: 1,
        status: "partial",
        startedAt: new Date("2026-08-27T12:00:00Z"),
        completedAt: new Date("2026-08-27T12:01:00Z"),
        recordsReceived: 11,
        recordsImported: 10,
        recordsRejected: 0,
        unmatchedPlayerCount: 1,
        playerIdentitiesImported: 5,
        gamesImported: 1,
        errorDetails: { kind: "partial_import" },
        hasUsableSnapshot: true,
      },
    ]);
    const summary = await retrieveHistoricalBackfillSummary(
      new Date("2026-08-27T12:00:00Z"),
    );
    expect(summary.weeks).toHaveLength(5 * 18);
    expect(summary.weeks[72]).toMatchObject({
      season: 2025,
      week: 1,
      status: "partial",
      unmatchedPlayerCount: 1,
    });
    expect(summary.weeks[73]).toMatchObject({ status: "missing" });
  });
});
