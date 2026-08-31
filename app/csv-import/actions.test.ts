import { beforeEach, describe, expect, it, vi } from "vitest";

import { importCsvFilesAction } from "@/app/csv-import/actions";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { importCsvBatch } from "@/services/csv-import";
import { retrieveLeagueConfiguration } from "@/services/league-configurations";

const { redirect, revalidatePath } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/session", () => ({ requireAuthenticatedUser: vi.fn() }));
vi.mock("@/services/csv-import", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/csv-import")>();
  return { ...actual, importCsvBatch: vi.fn() };
});
vi.mock("@/services/league-configurations", () => ({
  retrieveLeagueConfiguration: vi.fn(),
}));
vi.mock("@/services/projection-consensus", () => ({
  generateProjectionConsensus: vi.fn(),
}));

const outcome = {
  runId: "11111111-1111-4111-8111-111111111111",
  snapshotId: "22222222-2222-4222-8222-222222222222",
  status: "succeeded" as const,
  duplicate: false,
  recordsReceived: 2,
  recordsImported: 2,
  recordsRejected: 0,
  unmatchedPlayerCount: 0,
  playerIdentitiesReceived: 1,
  playerIdentitiesImported: 1,
  gamesReceived: 0,
  gamesImported: 0,
  coverageGaps: [],
  error: null,
};

function csvFile(name: string) {
  return new File(["PLAYER NAME,POS,ECR\nExample Runner,RB,4"], name, {
    type: "text/csv",
  });
}

describe("CSV import action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthenticatedUser).mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      email: "gm@example.com",
    });
    vi.mocked(retrieveLeagueConfiguration).mockResolvedValue(null);
  });

  it("imports multiple files and summarizes mixed results", async () => {
    vi.mocked(importCsvBatch).mockResolvedValue({
      files: [
        { fileName: "rankings.csv", status: "imported", outcome },
        { fileName: "broken.csv", status: "failed" },
      ],
    });
    const formData = new FormData();
    formData.set("provider", "fantasypros");
    formData.set("season", "2026");
    formData.set("scoring", "ppr");
    formData.append("files", csvFile("rankings.csv"));
    formData.append("files", csvFile("broken.csv"));

    await expect(importCsvFilesAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard?message=1%20CSV%20file%20imported%20%C2%B7%202%20records%20%C2%B7%201%20failed%20(broken.csv)",
    );
    expect(importCsvBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "fantasypros",
        season: 2026,
        week: null,
        scoring: "ppr",
        files: expect.arrayContaining([
          expect.objectContaining({ fileName: "rankings.csv" }),
          expect.objectContaining({ fileName: "broken.csv" }),
        ]),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("rejects a non-CSV file before ingestion", async () => {
    const formData = new FormData();
    formData.append("files", new File(["not csv"], "rankings.txt"));

    await expect(importCsvFilesAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard?error=rankings.txt%20must%20use%20the%20.csv%20extension.",
    );
    expect(importCsvBatch).not.toHaveBeenCalled();
  });

  it("reports a clear error when every file fails", async () => {
    vi.mocked(importCsvBatch).mockResolvedValue({
      files: [{ fileName: "broken.csv", status: "failed" }],
    });
    const formData = new FormData();
    formData.set("provider", "fantasynerds");
    formData.set("season", "2026");
    formData.set("scoring", "ppr");
    formData.append("files", csvFile("broken.csv"));

    await expect(importCsvFilesAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard?error=No%20files%20were%20imported.%20Check%3A%20broken.csv.",
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
