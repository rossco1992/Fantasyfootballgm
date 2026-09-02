import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assignDraftKeeperSlotsAction,
  clearDraftBoardAction,
  refreshDraftFantasyProsAction,
  renameDraftTeamsAction,
  savePersonalDraftSettingsAction,
  uploadYahooPlayersAction,
} from "@/app/draft/actions";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { importCsvBatch } from "@/services/csv-import";
import { refreshFantasyProsData } from "@/services/fantasypros-refresh";
import {
  assignDraftKeeperSlots,
  clearDraftBoard,
  renameDraftTeams,
  savePersonalDraftSettings,
  startDraftRoom,
} from "@/services/draft";
import { retrieveLeagueConfigurationById } from "@/services/league-configurations";
import { generateProjectionConsensus } from "@/services/projection-consensus";
import { DEFAULT_LEAGUE_CONFIGURATION } from "@/domain/league-configuration";

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
vi.mock("@/services/fantasypros-refresh", () => ({
  refreshFantasyProsData: vi.fn(),
}));
vi.mock("@/services/league-configurations", () => ({
  retrieveLeagueConfigurationById: vi.fn(),
}));
vi.mock("@/services/projection-consensus", () => ({
  generateProjectionConsensus: vi.fn(),
}));
vi.mock("@/services/draft", () => ({
  DraftRoomError: class DraftRoomError extends Error {},
  assignDraftKeeperSlots: vi.fn(),
  clearDraftBoard: vi.fn(),
  queueDraftPlayer: vi.fn(),
  recordNextDraftPick: vi.fn(),
  renameDraftTeams: vi.fn(),
  savePersonalDraftSettings: vi.fn(),
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

  it("refreshes every FantasyPros draft dataset from the draft room", async () => {
    const league = {
      ...DEFAULT_LEAGUE_CONFIGURATION,
      id: "44444444-4444-4444-8444-444444444444",
      userId: user.id,
      scoringPreset: "half_ppr" as const,
      createdAt: new Date("2026-08-30T12:00:00Z"),
      updatedAt: new Date("2026-08-30T12:00:00Z"),
    };
    vi.mocked(retrieveLeagueConfigurationById).mockResolvedValue(league);
    vi.mocked(refreshFantasyProsData).mockResolvedValue({
      ...outcome,
      recordsImported: 500,
      playerIdentitiesImported: 200,
    });
    const data = new FormData();
    data.set("leagueId", league.id);
    data.set("season", "2026");
    data.set("returnTab", "queue");

    await expect(refreshDraftFantasyProsAction(data)).rejects.toThrow(
      /REDIRECT:\/draft\?tab=queue&message=FantasyPros%20refreshed/,
    );
    expect(refreshFantasyProsData).toHaveBeenCalledWith({
      season: 2026,
      week: null,
      scoring: "half_ppr",
    });
    expect(generateProjectionConsensus).toHaveBeenCalledWith({
      leagueId: league.id,
      userId: user.id,
      season: 2026,
      week: null,
      horizon: "preseason",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/draft");
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
      "22222222-2222-4222-8222-222222222222",
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

  it("saves explicit keeper draft slots", async () => {
    const data = new FormData();
    data.set("leagueId", "44444444-4444-4444-8444-444444444444");
    data.set("keeperSlot.keeper-a", "3");
    data.set("keeperSlot.keeper-b", "");

    await expect(assignDraftKeeperSlotsAction(data)).rejects.toThrow(
      "REDIRECT:/draft?tab=available&message=Keeper%20draft%20slots%20saved.",
    );
    expect(assignDraftKeeperSlots).toHaveBeenCalledWith(
      user.id,
      "44444444-4444-4444-8444-444444444444",
      { "keeper-a": 3 },
    );
  });

  it("saves the user's personal draft setup", async () => {
    const data = new FormData();
    data.set("leagueId", "44444444-4444-4444-8444-444444444444");
    data.set("draftPosition", "3");
    data.set("keeperPlayerId", "player-a");
    data.set("keeperRound", "5");

    await expect(savePersonalDraftSettingsAction(data)).rejects.toThrow(
      "REDIRECT:/draft?tab=available&message=Draft%20settings%20saved.",
    );
    expect(savePersonalDraftSettings).toHaveBeenCalledWith({
      userId: user.id,
      leagueId: "44444444-4444-4444-8444-444444444444",
      draftPosition: 3,
      keeperPlayerId: "player-a",
      keeperRound: 5,
    });
  });

  it("clears the draft board", async () => {
    const data = new FormData();
    data.set("leagueId", "44444444-4444-4444-8444-444444444444");

    await expect(clearDraftBoardAction(data)).rejects.toThrow(
      "REDIRECT:/draft?tab=available&message=Draft%20board%20cleared.",
    );
    expect(clearDraftBoard).toHaveBeenCalledWith(
      user.id,
      "44444444-4444-4444-8444-444444444444",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/draft");
  });
});
