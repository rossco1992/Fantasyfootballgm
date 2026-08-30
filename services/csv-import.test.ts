import { describe, expect, it, vi } from "vitest";

import { importCsvBatch } from "@/services/csv-import";

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

function file(fileName: string) {
  return {
    fileName,
    observedAt: "2026-08-30T12:00:00.000Z",
    csv: "PLAYER NAME,POS,TEAM,ECR\nExample Runner,RB,SF,4",
  };
}

describe("CSV import service", () => {
  it("imports multiple files sequentially through stable file-specific sources", async () => {
    const run = vi.fn().mockResolvedValue(outcome);
    const result = await importCsvBatch(
      {
        provider: "fantasypros",
        season: 2026,
        week: null,
        scoring: "ppr",
        files: [file("rankings.csv"), file("projections.csv")],
      },
      { run },
    );

    expect(result.files).toEqual([
      { fileName: "rankings.csv", status: "imported", outcome },
      { fileName: "projections.csv", status: "imported", outcome },
    ]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.map((call) => call[0].descriptor.slug)).toEqual([
      expect.stringMatching(/^fantasypros-csv-[a-f0-9]{12}$/),
      expect.stringMatching(/^fantasypros-csv-[a-f0-9]{12}$/),
    ]);
    expect(run.mock.calls[0]?.[2]).toMatchObject({
      updateCanonicalPlayerMetadata: true,
    });
  });

  it("keeps successful files when another file fails", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(outcome)
      .mockRejectedValueOnce(new Error("invalid file"));

    const result = await importCsvBatch(
      {
        provider: "fantasynerds",
        season: 2026,
        week: 1,
        scoring: "half_ppr",
        files: [file("rankings.csv"), file("broken.csv")],
      },
      { run },
    );

    expect(result.files).toEqual([
      { fileName: "rankings.csv", status: "imported", outcome },
      { fileName: "broken.csv", status: "failed" },
    ]);
  });
});
