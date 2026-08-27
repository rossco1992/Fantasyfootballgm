import { beforeEach, describe, expect, it, vi } from "vitest";

import { query } from "@/db/client";
import {
  hasCompletedHistoricalScope,
  listHistoricalBackfillScopes,
} from "@/db/repositories/historical-backfill";

vi.mock("@/db/client", () => ({ query: vi.fn() }));

describe("historical backfill repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("checks for a successful persisted season/week", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{ complete: true }],
    } as never);
    await expect(
      hasCompletedHistoricalScope("nflverse", 2025, 1),
    ).resolves.toBe(true);
    expect(vi.mocked(query).mock.calls[0]?.[0]).toContain(
      "run.status = 'succeeded'",
    );
    expect(vi.mocked(query).mock.calls[0]?.[1]).toEqual(["nflverse", 2025, 1]);
  });

  it("returns the latest attempt with counts and retained-snapshot state", async () => {
    const now = new Date("2026-08-27T12:00:00Z");
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          run_id: "11111111-1111-4111-8111-111111111111",
          season: 2025,
          week: 1,
          status: "failed",
          started_at: now,
          completed_at: now,
          records_received: 0,
          records_imported: 0,
          records_rejected: 0,
          unmatched_player_count: 0,
          player_identities_imported: 0,
          games_imported: 0,
          error_details: { kind: "adapter_error" },
          has_usable_snapshot: true,
        },
      ],
    } as never);

    await expect(listHistoricalBackfillScopes("nflverse")).resolves.toEqual([
      expect.objectContaining({
        season: 2025,
        week: 1,
        status: "failed",
        hasUsableSnapshot: true,
      }),
    ]);
    expect(vi.mocked(query).mock.calls[0]?.[0]).toContain(
      "distinct on (run.season, run.week)",
    );
  });
});
