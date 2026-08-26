import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRosterAssignment,
  listRosterAssignmentsForLeague,
} from "@/db/repositories/roster-assignments";
import { createPlayer, listPlayers } from "@/db/repositories/players";
import { DEFAULT_LEAGUE_CONFIGURATION } from "@/domain/league-configuration";
import type { RosterAssignment } from "@/domain/roster";
import { retrieveLeagueConfigurationById } from "@/services/league-configurations";
import {
  addManualRosterPlayer,
  RosterSetupError,
} from "@/services/roster-setup";

vi.mock("@/db/repositories/roster-assignments", () => ({
  createRosterAssignment: vi.fn(),
  deleteRosterAssignment: vi.fn(),
  listRosterAssignmentsForLeague: vi.fn(),
}));
vi.mock("@/db/repositories/players", () => ({
  createPlayer: vi.fn(),
  listPlayers: vi.fn(),
}));
vi.mock("@/services/league-configurations", () => ({
  retrieveLeagueConfigurationById: vi.fn(),
}));

const league = {
  ...DEFAULT_LEAGUE_CONFIGURATION,
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  leagueFormat: "keeper" as const,
  maxKeepersPerTeam: 1,
  createdAt: new Date("2026-08-26T12:00:00Z"),
  updatedAt: new Date("2026-08-26T12:00:00Z"),
};

const input = {
  fullName: "Christian McCaffrey",
  position: "RB" as const,
  nflTeam: "SF",
  fantasyTeamName: "My Team",
  acquisitionType: "drafted" as const,
  isKeeper: true,
  originalDraftRound: 2,
};

describe("roster setup service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(retrieveLeagueConfigurationById).mockResolvedValue(league);
    vi.mocked(listRosterAssignmentsForLeague).mockResolvedValue([]);
    vi.mocked(listPlayers).mockResolvedValue([]);
    vi.mocked(createPlayer).mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      fullName: input.fullName,
      position: input.position,
      nflTeam: input.nflTeam,
      byeWeek: null,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(createRosterAssignment).mockResolvedValue({} as RosterAssignment);
  });

  it("creates an unmatched canonical player before assigning the keeper", async () => {
    await addManualRosterPlayer(league.userId, league.id, input, 2026);

    expect(createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: input.fullName,
        position: "RB",
        status: "active",
      }),
    );
    expect(createRosterAssignment).toHaveBeenCalledWith(
      league.id,
      league.userId,
      "33333333-3333-4333-8333-333333333333",
      input,
      2025,
    );
  });

  it("reuses a deterministic canonical player match", async () => {
    vi.mocked(listPlayers).mockResolvedValue([
      {
        id: "55555555-5555-4555-8555-555555555555",
        fullName: input.fullName,
        position: "RB",
        nflTeam: "SF",
        byeWeek: null,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await addManualRosterPlayer(league.userId, league.id, input, 2026);

    expect(createPlayer).not.toHaveBeenCalled();
    expect(createRosterAssignment).toHaveBeenCalledWith(
      league.id,
      league.userId,
      "55555555-5555-4555-8555-555555555555",
      input,
      2025,
    );
  });

  it("blocks a second keeper when the configured maximum is reached", async () => {
    vi.mocked(listRosterAssignmentsForLeague).mockResolvedValue([
      {
        id: "66666666-6666-4666-8666-666666666666",
        leagueId: league.id,
        playerId: "77777777-7777-4777-8777-777777777777",
        fullName: "Existing Keeper",
        position: "WR",
        nflTeam: "NYJ",
        playerStatus: "active",
        fantasyTeamName: "My Team",
        acquisitionType: "drafted",
        isKeeper: true,
        originalDraftSeason: 2025,
        originalDraftRound: 4,
        keeperSeason: 2026,
        keeperCostRound: 4,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await expect(
      addManualRosterPlayer(league.userId, league.id, input, 2026),
    ).rejects.toThrow(RosterSetupError);
    expect(createRosterAssignment).not.toHaveBeenCalled();
  });
});
