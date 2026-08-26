import { beforeEach, describe, expect, it, vi } from "vitest";

import { query } from "@/db/client";
import {
  createRosterAssignment,
  deleteRosterAssignment,
  listRosterAssignmentsForLeague,
} from "@/db/repositories/roster-assignments";

vi.mock("@/db/client", () => ({ query: vi.fn() }));

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  league_id: "22222222-2222-4222-8222-222222222222",
  player_id: "33333333-3333-4333-8333-333333333333",
  full_name: "Christian McCaffrey",
  position: "RB",
  nfl_team: "SF",
  player_status: "active",
  fantasy_team_name: "My Team",
  acquisition_type: "drafted",
  is_keeper: true,
  original_draft_season: 2025,
  original_draft_round: 2,
  keeper_season: 2026,
  keeper_cost_round: 2,
  created_at: new Date("2026-08-26T12:00:00Z"),
  updated_at: new Date("2026-08-26T12:00:00Z"),
};

describe("roster assignment repository", () => {
  beforeEach(() => vi.mocked(query).mockReset());

  it("lists assignments only through the owning league", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [row] } as never);

    const assignments = await listRosterAssignmentsForLeague(
      row.league_id,
      "44444444-4444-4444-8444-444444444444",
    );

    expect(assignments[0]).toMatchObject({
      fullName: "Christian McCaffrey",
      isKeeper: true,
      keeperCostRound: 2,
    });
    expect(vi.mocked(query).mock.calls[0]?.[1]).toEqual([
      row.league_id,
      "44444444-4444-4444-8444-444444444444",
    ]);
  });

  it("persists prior draft history and the same keeper cost round", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [row] } as never);

    await createRosterAssignment(
      row.league_id,
      "44444444-4444-4444-8444-444444444444",
      row.player_id,
      {
        fullName: row.full_name,
        position: "RB",
        nflTeam: "SF",
        fantasyTeamName: row.fantasy_team_name,
        acquisitionType: "drafted",
        isKeeper: true,
        originalDraftRound: 2,
      },
      2025,
    );

    const [sql, values] = vi.mocked(query).mock.calls[0]!;
    expect(sql).toContain("keeper_cost_round");
    expect(values).toEqual([
      row.league_id,
      "44444444-4444-4444-8444-444444444444",
      row.player_id,
      "My Team",
      "drafted",
      true,
      2025,
      2,
    ]);
  });

  it("deletes only through the owning user", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{ id: row.id }],
      rowCount: 1,
    } as never);

    await expect(
      deleteRosterAssignment(row.id, "44444444-4444-4444-8444-444444444444"),
    ).resolves.toBe(true);
  });
});
