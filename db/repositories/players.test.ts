import { beforeEach, describe, expect, it, vi } from "vitest";

import { query } from "@/db/client";
import {
  countDraftablePlayers,
  getPlayerByExternalId,
  searchDraftablePlayers,
  updatePlayer,
} from "@/db/repositories/players";

vi.mock("@/db/client", () => ({ query: vi.fn() }));

const playerRow = {
  id: "11111111-1111-4111-8111-111111111111",
  full_name: "Example Player",
  position: "RB",
  nfl_team: null,
  bye_week: null,
  status: "active",
  created_at: new Date("2026-08-20T12:00:00Z"),
  updated_at: new Date("2026-08-20T12:00:00Z"),
};

describe("canonical player repository", () => {
  beforeEach(() => vi.mocked(query).mockReset());

  it("resolves a canonical player by provider external ID", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [playerRow] } as never);

    const player = await getPlayerByExternalId("mock-provider", "player-42");

    expect(player).toMatchObject({
      id: playerRow.id,
      fullName: playerRow.full_name,
      nflTeam: null,
      byeWeek: null,
      status: "active",
    });
    expect(vi.mocked(query).mock.calls[0]?.[1]).toEqual([
      "mock-provider",
      "player-42",
    ]);
  });

  it("updates mutable attributes without changing the stable player ID", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          ...playerRow,
          nfl_team: "NYJ",
          bye_week: 12,
          status: "questionable",
        },
      ],
    } as never);

    const player = await updatePlayer(playerRow.id, {
      fullName: playerRow.full_name,
      position: "RB",
      nflTeam: "NYJ",
      byeWeek: 12,
      status: "questionable",
    });

    expect(player).toMatchObject({
      id: playerRow.id,
      nflTeam: "NYJ",
      byeWeek: 12,
      status: "questionable",
    });
    expect(vi.mocked(query).mock.calls[0]?.[1]?.[0]).toBe(playerRow.id);
  });

  it("queries the draftable player pool by search and position", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [playerRow] } as never);

    const players = await searchDraftablePlayers({
      search: "Example",
      position: "RB",
      limit: 25,
    });

    expect(players).toHaveLength(1);
    expect(vi.mocked(query).mock.calls[0]?.[1]).toEqual([
      "sleeper-player-catalog",
      "Example",
      "RB",
      25,
    ]);
    expect(String(vi.mocked(query).mock.calls[0]?.[0])).toContain(
      "status not in ('inactive', 'retired')",
    );
    expect(String(vi.mocked(query).mock.calls[0]?.[0])).toContain(
      "ingestion_state.latest_snapshot_id = identity_record.snapshot_id",
    );
  });

  it("reports the available draftable player count", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [{ count: 642 }] } as never);

    await expect(countDraftablePlayers()).resolves.toBe(642);
    expect(vi.mocked(query).mock.calls[0]?.[1]).toEqual([
      "sleeper-player-catalog",
    ]);
    expect(String(vi.mocked(query).mock.calls[0]?.[0])).toContain(
      "ingestion_state.latest_snapshot_id = identity_record.snapshot_id",
    );
  });
});
