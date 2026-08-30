import { describe, expect, it, vi } from "vitest";

import type { FantasyProsDataClient } from "@/providers/fantasypros/fantasypros-provider-adapter";
import { refreshFantasyProsData } from "@/services/fantasypros-refresh";

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
  gamesReceived: 0,
  gamesImported: 0,
  coverageGaps: [],
  error: null,
};

describe("FantasyPros refresh service", () => {
  it("runs the API adapter through the immutable ingestion pipeline", async () => {
    const run = vi.fn().mockResolvedValue(outcome);
    const client = { fetchAll: vi.fn() } as unknown as FantasyProsDataClient;

    await expect(
      refreshFantasyProsData(
        { season: "2026", week: null, scoring: "half_ppr" },
        { client, run },
      ),
    ).resolves.toEqual(outcome);

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        descriptor: expect.objectContaining({ slug: "fantasypros" }),
      }),
      { trigger: "on_demand", season: 2026, week: null },
      expect.objectContaining({ updateCanonicalPlayerMetadata: true }),
    );
  });

  it("rejects invalid refresh scopes before making a request", async () => {
    const run = vi.fn();
    const client = { fetchAll: vi.fn() } as unknown as FantasyProsDataClient;
    await expect(
      refreshFantasyProsData(
        { season: 1999, week: null, scoring: "ppr" },
        { client, run },
      ),
    ).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
});
