import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteAllDraftPicks,
  getDraftSessionForLeague,
  insertDraftPick,
  listDraftPicks,
  listDraftQueue,
  listYahooDraftPlayers,
  updateDraftKeeperTeamSlots,
  updateDraftTeamNames,
} from "@/db/repositories/draft";
import { upsertDraftUserKeeper } from "@/db/repositories/roster-assignments";
import { DEFAULT_LEAGUE_CONFIGURATION } from "@/domain/league-configuration";
import {
  clearDraftBoard,
  assignDraftKeeperSlots,
  loadDraftRoom,
  recordNextDraftPick,
  renameDraftTeams,
  savePersonalDraftSettings,
} from "@/services/draft";
import {
  retrieveLeagueConfigurationById,
  saveLeagueConfiguration,
} from "@/services/league-configurations";
import { retrieveManualRoster } from "@/services/roster-setup";
import { loadDraftAssistant } from "@/services/draft-recommendations";
import { retrieveProviderFreshness } from "@/services/provider-ingestion";

vi.mock("@/db/repositories/draft", () => ({
  addDraftQueueEntry: vi.fn(),
  deleteAllDraftPicks: vi.fn(),
  deleteLastDraftPick: vi.fn(),
  getDraftSessionForLeague: vi.fn(),
  insertDraftPick: vi.fn(),
  listDraftPicks: vi.fn(),
  listDraftQueue: vi.fn(),
  listYahooDraftPlayers: vi.fn(),
  removeDraftQueueEntry: vi.fn(),
  updateDraftTeamNames: vi.fn(),
  updateDraftKeeperTeamSlots: vi.fn(),
  upsertDraftSession: vi.fn(),
}));
vi.mock("@/db/repositories/roster-assignments", () => ({
  upsertDraftUserKeeper: vi.fn(),
}));
vi.mock("@/services/league-configurations", () => ({
  retrieveLeagueConfigurationById: vi.fn(),
  saveLeagueConfiguration: vi.fn(),
}));
vi.mock("@/services/roster-setup", () => ({
  retrieveManualRoster: vi.fn(),
}));
vi.mock("@/services/draft-recommendations", () => ({
  loadDraftAssistant: vi.fn(),
}));
vi.mock("@/services/provider-ingestion", () => ({
  retrieveProviderFreshness: vi.fn(),
}));

const userId = "11111111-1111-4111-8111-111111111111";
const leagueId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const playerId = "44444444-4444-4444-8444-444444444444";

describe("live draft service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(retrieveLeagueConfigurationById).mockResolvedValue({
      ...DEFAULT_LEAGUE_CONFIGURATION,
      id: leagueId,
      userId,
      teamCount: 12,
      draftType: "snake",
      createdAt: new Date("2026-08-30T12:00:00Z"),
      updatedAt: new Date("2026-08-30T12:00:00Z"),
    });
    vi.mocked(getDraftSessionForLeague).mockResolvedValue({
      id: sessionId,
      leagueId,
      season: 2026,
      status: "active",
      teamNames: {},
      keeperTeamSlots: {},
      playerPoolSnapshotId: null,
      createdAt: new Date("2026-08-30T12:00:00Z"),
      updatedAt: new Date("2026-08-30T12:00:00Z"),
    });
    vi.mocked(listYahooDraftPlayers).mockResolvedValue([
      {
        id: playerId,
        fullName: "Example Runner",
        position: "RB",
        nflTeam: "SF",
        byeWeek: 9,
        status: "active",
        yahooRank: 1,
        yahooAdp: 2.4,
        createdAt: new Date("2026-08-30T12:00:00Z"),
        updatedAt: new Date("2026-08-30T12:00:00Z"),
      },
    ]);
    vi.mocked(retrieveManualRoster).mockResolvedValue([]);
    vi.mocked(retrieveProviderFreshness).mockResolvedValue(null);
    vi.mocked(loadDraftAssistant).mockResolvedValue({
      version: "draft-recommendation-v2",
      dataMode: "market_only",
      currentOverallPick: 1,
      nextUserOverallPick: 1,
      picksUntilUser: 0,
      recommendations: [],
    });
  });

  it("records the next pick using deterministic snake coordinates", async () => {
    vi.mocked(listDraftPicks).mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        sessionId,
        playerId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        fullName: `Player ${index + 1}`,
        position: "WR",
        nflTeam: "NYJ",
        overallPick: index + 1,
        round: 1,
        pickInRound: index + 1,
        fantasyTeamSlot: index + 1,
        createdAt: new Date("2026-08-30T12:00:00Z"),
      })),
    );

    await recordNextDraftPick({ userId, leagueId, playerId });

    expect(insertDraftPick).toHaveBeenCalledWith(sessionId, playerId, {
      overallPick: 13,
      round: 2,
      pickInRound: 1,
      fantasyTeamSlot: 12,
    });
  });

  it("does not draft a player outside the uploaded Yahoo pool", async () => {
    vi.mocked(listDraftPicks).mockResolvedValue([]);

    await expect(
      recordNextDraftPick({
        userId,
        leagueId,
        playerId: "55555555-5555-4555-8555-555555555555",
      }),
    ).rejects.toThrow("not in the Yahoo draft pool");
    expect(insertDraftPick).not.toHaveBeenCalled();
  });

  it("rejects picks after every configured roster slot is filled", async () => {
    vi.mocked(retrieveLeagueConfigurationById).mockResolvedValue({
      ...DEFAULT_LEAGUE_CONFIGURATION,
      id: leagueId,
      userId,
      teamCount: 4,
      rosterSlots: {
        qb: 1,
        rb: 0,
        wr: 0,
        te: 0,
        flex: 0,
        superflex: 0,
        k: 0,
        dst: 0,
        bench: 0,
      },
      createdAt: new Date("2026-08-30T12:00:00Z"),
      updatedAt: new Date("2026-08-30T12:00:00Z"),
    });
    vi.mocked(listDraftPicks).mockResolvedValue(
      Array.from({ length: 4 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        sessionId,
        playerId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        fullName: `Player ${index + 1}`,
        position: "QB",
        nflTeam: "NYJ",
        overallPick: index + 1,
        round: 1,
        pickInRound: index + 1,
        fantasyTeamSlot: index + 1,
        createdAt: new Date("2026-08-30T12:00:00Z"),
      })),
    );

    await expect(
      recordNextDraftPick({ userId, leagueId, playerId }),
    ).rejects.toThrow("draft is complete");
    expect(insertDraftPick).not.toHaveBeenCalled();
  });

  it("binds availability to the session upload and removes keepers", async () => {
    const keeperId = "55555555-5555-4555-8555-555555555555";
    const keeperAssignmentId = "77777777-7777-4777-8777-777777777777";
    const snapshotId = "66666666-6666-4666-8666-666666666666";
    vi.mocked(getDraftSessionForLeague).mockResolvedValue({
      id: sessionId,
      leagueId,
      season: 2026,
      status: "active",
      teamNames: {},
      keeperTeamSlots: { [keeperAssignmentId]: 1 },
      playerPoolSnapshotId: snapshotId,
      createdAt: new Date("2026-08-30T12:00:00Z"),
      updatedAt: new Date("2026-08-30T12:00:00Z"),
    });
    vi.mocked(listYahooDraftPlayers).mockResolvedValue([
      {
        id: playerId,
        fullName: "Available Runner",
        position: "RB",
        nflTeam: "SF",
        byeWeek: 9,
        status: "active",
        yahooRank: 1,
        yahooAdp: 2,
        createdAt: new Date("2026-08-30T12:00:00Z"),
        updatedAt: new Date("2026-08-30T12:00:00Z"),
      },
      {
        id: keeperId,
        fullName: "Keeper Receiver",
        position: "WR",
        nflTeam: "DAL",
        byeWeek: 10,
        status: "active",
        yahooRank: 2,
        yahooAdp: 3,
        createdAt: new Date("2026-08-30T12:00:00Z"),
        updatedAt: new Date("2026-08-30T12:00:00Z"),
      },
    ]);
    vi.mocked(listDraftPicks).mockResolvedValue([]);
    vi.mocked(listDraftQueue).mockResolvedValue([]);
    vi.mocked(retrieveManualRoster).mockResolvedValue([
      {
        id: keeperAssignmentId,
        leagueId,
        playerId: keeperId,
        fullName: "Keeper Receiver",
        position: "WR",
        nflTeam: "DAL",
        playerStatus: "active",
        fantasyTeamName: "Team 2",
        acquisitionType: "drafted",
        isKeeper: true,
        originalDraftSeason: 2025,
        originalDraftRound: 4,
        keeperSeason: 2026,
        keeperCostRound: 4,
        createdAt: new Date("2026-08-30T12:00:00Z"),
        updatedAt: new Date("2026-08-30T12:00:00Z"),
      },
    ]);

    const room = await loadDraftRoom(userId, leagueId);

    expect(listYahooDraftPlayers).toHaveBeenCalledWith(snapshotId);
    expect(room.availablePlayers.map((player) => player.id)).toEqual([
      playerId,
    ]);
    expect(loadDraftAssistant).toHaveBeenCalledWith(
      expect.objectContaining({
        availablePlayers: room.availablePlayers,
        keeperReservations: [
          expect.objectContaining({
            fantasyTeamSlot: 1,
            keeper: expect.objectContaining({ playerId: keeperId }),
          }),
        ],
      }),
    );
  });

  it("saves trimmed names for every configured team", async () => {
    const names = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        String(index + 1),
        ` Team ${index + 1} `,
      ]),
    );

    await renameDraftTeams(userId, leagueId, names);

    expect(updateDraftTeamNames).toHaveBeenCalledWith(
      userId,
      leagueId,
      Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [
          String(index + 1),
          `Team ${index + 1}`,
        ]),
      ),
    );
  });

  it("maps a keeper directly to the user's draft slot", async () => {
    const keeperId = "77777777-7777-4777-8777-777777777777";
    vi.mocked(retrieveLeagueConfigurationById).mockResolvedValue({
      ...DEFAULT_LEAGUE_CONFIGURATION,
      id: leagueId,
      userId,
      leagueFormat: "keeper",
      maxKeepersPerTeam: 1,
      draftPosition: 3,
      createdAt: new Date("2026-08-30T12:00:00Z"),
      updatedAt: new Date("2026-08-30T12:00:00Z"),
    });
    vi.mocked(retrieveManualRoster).mockResolvedValue([
      {
        id: keeperId,
        leagueId,
        playerId: "88888888-8888-4888-8888-888888888888",
        fullName: "My Keeper",
        position: "WR",
        nflTeam: "DAL",
        playerStatus: "active",
        fantasyTeamName: "Any display name",
        acquisitionType: "drafted",
        isKeeper: true,
        originalDraftSeason: 2025,
        originalDraftRound: 4,
        keeperSeason: 2026,
        keeperCostRound: 4,
        createdAt: new Date("2026-08-30T12:00:00Z"),
        updatedAt: new Date("2026-08-30T12:00:00Z"),
      },
    ]);

    await assignDraftKeeperSlots(userId, leagueId, { [keeperId]: 3 });

    expect(updateDraftKeeperTeamSlots).toHaveBeenCalledWith(userId, leagueId, {
      [keeperId]: 3,
    });
  });

  it("saves the user's draft position, keeper, and keeper round together", async () => {
    const keeperId = "77777777-7777-4777-8777-777777777777";
    vi.mocked(retrieveLeagueConfigurationById).mockResolvedValue({
      ...DEFAULT_LEAGUE_CONFIGURATION,
      id: leagueId,
      userId,
      leagueFormat: "keeper",
      maxKeepersPerTeam: 1,
      draftPosition: 1,
      createdAt: new Date("2026-08-30T12:00:00Z"),
      updatedAt: new Date("2026-08-30T12:00:00Z"),
    });
    vi.mocked(getDraftSessionForLeague).mockResolvedValue({
      id: sessionId,
      leagueId,
      season: 2026,
      status: "active",
      teamNames: {},
      keeperTeamSlots: {},
      playerPoolSnapshotId: null,
      createdAt: new Date("2026-08-30T12:00:00Z"),
      updatedAt: new Date("2026-08-30T12:00:00Z"),
    });
    vi.mocked(listDraftPicks).mockResolvedValue([]);
    vi.mocked(upsertDraftUserKeeper).mockResolvedValue(keeperId);

    await savePersonalDraftSettings({
      userId,
      leagueId,
      draftPosition: 3,
      keeperPlayerId: playerId,
      keeperRound: 5,
    });

    expect(saveLeagueConfiguration).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ draftPosition: 3 }),
    );
    expect(upsertDraftUserKeeper).toHaveBeenCalledWith(
      leagueId,
      userId,
      playerId,
      "My Team",
      2026,
      5,
    );
    expect(updateDraftKeeperTeamSlots).toHaveBeenCalledWith(userId, leagueId, {
      [keeperId]: 3,
    });
    expect(updateDraftTeamNames).toHaveBeenCalledWith(userId, leagueId, {
      "1": "Team 3",
      "3": "My Team",
    });
  });

  it("skips a keeper-reserved pick when recording the next player", async () => {
    const keeperId = "77777777-7777-4777-8777-777777777777";
    vi.mocked(getDraftSessionForLeague).mockResolvedValue({
      id: sessionId,
      leagueId,
      season: 2026,
      status: "active",
      teamNames: {},
      keeperTeamSlots: { [keeperId]: 1 },
      playerPoolSnapshotId: null,
      createdAt: new Date("2026-08-30T12:00:00Z"),
      updatedAt: new Date("2026-08-30T12:00:00Z"),
    });
    vi.mocked(listDraftPicks).mockResolvedValue([]);
    vi.mocked(retrieveManualRoster).mockResolvedValue([
      {
        id: keeperId,
        leagueId,
        playerId: "88888888-8888-4888-8888-888888888888",
        fullName: "Round One Keeper",
        position: "WR",
        nflTeam: "DAL",
        playerStatus: "active",
        fantasyTeamName: "My Team",
        acquisitionType: "drafted",
        isKeeper: true,
        originalDraftSeason: 2025,
        originalDraftRound: 1,
        keeperSeason: 2026,
        keeperCostRound: 1,
        createdAt: new Date("2026-08-30T12:00:00Z"),
        updatedAt: new Date("2026-08-30T12:00:00Z"),
      },
    ]);

    await recordNextDraftPick({ userId, leagueId, playerId });

    expect(insertDraftPick).toHaveBeenCalledWith(sessionId, playerId, {
      overallPick: 2,
      round: 1,
      pickInRound: 2,
      fantasyTeamSlot: 2,
    });
  });

  it("requires a name for every team", async () => {
    await expect(
      renameDraftTeams(userId, leagueId, { "1": "My Team" }),
    ).rejects.toThrow("Team 2 needs a name");
    expect(updateDraftTeamNames).not.toHaveBeenCalled();
  });

  it("clears every recorded pick without changing other draft state", async () => {
    await clearDraftBoard(userId, leagueId);

    expect(deleteAllDraftPicks).toHaveBeenCalledWith(sessionId);
  });
});
