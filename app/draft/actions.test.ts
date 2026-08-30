import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  renameDraftTeamsAction,
  uploadYahooPlayersAction,
} from "@/app/draft/actions";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { importCsvBatch } from "@/services/csv-import";
import { renameDraftTeams, startDraftRoom } from "@/services/draft";

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
vi.mock("@/services/draft", () => ({
  queueDraftPlayer: vi.fn(),
  recordNextDraftPick: vi.fn(),
  renameDraftTeams: vi.fn(),
  startDraftRoom: vi.fn(),
  undoLastDraftPick: vi.fn(),
  unqueueDraftPlayer: vi.fn(),
}));

const user = {
  id: "33333333-3333-4333-8333-333333333333",
  email: "gm@example.com",
};

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

function formData() {
  const data = new FormData();
  data.set("leagueId", "44444444-4444-4444-8444-444444444444");
  data.set("season", "2026");
  data.set("scoring", "half_ppr");
  data.set(
    "file",
    new File(["Rank,Player,Team,Pos\n1,Example Runner,SF,RB"], "yahoo.csv"),
  );
  return data;
}

describe("Yahoo draft upload action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthenticatedUser).mockResolvedValue(user);
  });

  it("starts the draft room after importing Yahoo players", async () => {
    vi.mocked(importCsvBatch).mockResolvedValue({
      files: [{ fileName: "yahoo.csv", status: "imported", outcome }],
    });

    await expect(uploadYahooPlayersAction(formData())).rejects.toThrow(
      "REDIRECT:/draft?tab=available&message=Yahoo%20players%20loaded.%20Your%20draft%20room%20is%20ready.",
    );
    expect(startDraftRoom).toHaveBeenCalledWith(
      user.id,
      "44444444-4444-4444-8444-444444444444",
      2026,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/draft");
  });

  it("shows a useful error when the CSV is not recognized", async () => {
    vi.mocked(importCsvBatch).mockResolvedValue({
      files: [{ fileName: "yahoo.csv", status: "failed" }],
    });

    await expect(uploadYahooPlayersAction(formData())).rejects.toThrow(
      /Yahoo%20CSV%20needs%20Player%2C%20Position/,
    );
    expect(startDraftRoom).not.toHaveBeenCalled();
  });

  it("shows a useful error when draft setup fails after import", async () => {
    vi.mocked(importCsvBatch).mockResolvedValue({
      files: [{ fileName: "yahoo.csv", status: "imported", outcome }],
    });
    vi.mocked(startDraftRoom).mockRejectedValue(new Error("database failure"));

    await expect(uploadYahooPlayersAction(formData())).rejects.toThrow(
      /players%20imported%2C%20but%20the%20draft%20room%20could%20not%20start/,
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("saves editable team names", async () => {
    const data = new FormData();
    data.set("leagueId", "44444444-4444-4444-8444-444444444444");
    data.set("teamName.1", "My Team");
    data.set("teamName.2", "The Rivals");

    await expect(renameDraftTeamsAction(data)).rejects.toThrow(
      "REDIRECT:/draft?tab=available&message=Team%20names%20saved.",
    );
    expect(renameDraftTeams).toHaveBeenCalledWith(
      user.id,
      "44444444-4444-4444-8444-444444444444",
      { "1": "My Team", "2": "The Rivals" },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/draft");
  });
});
