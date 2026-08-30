import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getDraftSessionForLeague,
  insertDraftPick,
  listDraftPicks,
  listYahooDraftPlayers,
  updateDraftTeamNames,
} from "@/db/repositories/draft";
import { DEFAULT_LEAGUE_CONFIGURATION } from "@/domain/league-configuration";
import { recordNextDraftPick, renameDraftTeams } from "@/services/draft";
import { retrieveLeagueConfigurationById } from "@/services/league-configurations";

vi.mock("@/db/repositories/draft", () => ({
  addDraftQueueEntry: vi.fn(),
  deleteLastDraftPick: vi.fn(),
  getDraftSessionForLeague: vi.fn(),
  insertDraftPick: vi.fn(),
  listDraftPicks: vi.fn(),
  listDraftQueue: vi.fn(),
  listYahooDraftPlayers: vi.fn(),
  removeDraftQueueEntry: vi.fn(),
  updateDraftTeamNames: vi.fn(),
  upsertDraftSession: vi.fn(),
}));
vi.mock("@/services/league-configurations", () => ({
  retrieveLeagueConfigurationById: vi.fn(),
}));
vi.mock("@/services/roster-setup", () => ({
  retrieveManualRoster: vi.fn(),
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

  it("requires a name for every team", async () => {
    await expect(
      renameDraftTeams(userId, leagueId, { "1": "My Team" }),
    ).rejects.toThrow("Team 2 needs a name");
    expect(updateDraftTeamNames).not.toHaveBeenCalled();
  });
});
