import { describe, expect, it, vi } from "vitest";

import {
  configuredProjectionSources,
  importProjectionCsv,
  refreshConfiguredProjectionSources,
} from "@/services/projection-sources";

const outcome = {
  runId: "11111111-1111-4111-8111-111111111111",
  snapshotId: "22222222-2222-4222-8222-222222222222",
  status: "succeeded" as const,
  duplicate: false,
  recordsReceived: 1,
  recordsImported: 1,
  recordsRejected: 0,
  unmatchedPlayerCount: 0,
  playerIdentitiesReceived: 1,
  playerIdentitiesImported: 1,
  gamesReceived: 0,
  gamesImported: 0,
  coverageGaps: [],
  error: null,
};

describe("projection source service", () => {
  it("reports only providers with configured server credentials", () => {
    expect(configuredProjectionSources({ FANTASYPROS_API_KEY: "key" })).toEqual(
      ["FantasyPros"],
    );
  });

  it("does not fail when no paid API source is configured", async () => {
    await expect(
      refreshConfiguredProjectionSources(
        { season: 2026, week: null, scoring: "ppr" },
        { env: {} },
      ),
    ).resolves.toEqual({ configured: [], outcomes: [] });
  });

  it("runs each configured source through the shared ingestion boundary", async () => {
    const run = vi.fn().mockResolvedValue(outcome);
    const lock = async <T>(_provider: string, operation: () => Promise<T>) =>
      operation();
    const result = await refreshConfiguredProjectionSources(
      { season: 2026, week: 3, scoring: "half_ppr" },
      {
        env: {
          FANTASYPROS_API_KEY: "fp-key",
          FANTASYNERDS_API_KEY: "fn-key",
        },
        run,
        lock,
      },
    );
    expect(result.configured).toEqual(["FantasyPros", "Fantasy Nerds"]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.map((call) => call[0].descriptor.slug)).toEqual([
      "fantasypros",
      "fantasynerds",
    ]);
  });

  it("imports a supported CSV without any API credentials", async () => {
    const run = vi.fn().mockResolvedValue(outcome);
    await expect(
      importProjectionCsv(
        {
          provider: "fantasypros",
          season: 2026,
          week: null,
          scoring: "ppr",
          fileName: "rankings.csv",
          observedAt: "2026-08-27T12:00:00.000Z",
          csv: "PLAYER NAME,POS,TEAM,ECR\nExample Runner,RB,SF,4",
        },
        { run },
      ),
    ).resolves.toEqual(outcome);
    expect(run.mock.calls[0]?.[0].descriptor.slug).toBe("fantasypros-csv");
  });
});
