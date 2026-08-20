import { beforeEach, describe, expect, it, vi } from "vitest";

import { query } from "@/db/client";
import {
  getLeagueConfigurationByIdForUser,
  getLeagueConfigurationForUser,
  upsertLeagueConfiguration,
} from "@/db/repositories/league-configurations";
import { DEFAULT_LEAGUE_CONFIGURATION } from "@/domain/league-configuration";

vi.mock("@/db/client", () => ({ query: vi.fn() }));

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  name: "Home League",
  team_count: 12,
  draft_type: "snake",
  draft_position: 4,
  scoring_preset: "half_ppr",
  qb_slots: 1,
  rb_slots: 2,
  wr_slots: 3,
  te_slots: 1,
  flex_slots: 1,
  superflex_slots: 0,
  k_slots: 1,
  dst_slots: 1,
  bench_slots: 6,
  created_at: new Date("2026-08-19T12:00:00Z"),
  updated_at: new Date("2026-08-19T12:00:00Z"),
};

describe("league configuration repository", () => {
  beforeEach(() => vi.mocked(query).mockReset());

  it("returns a downstream-ready configuration for its owner", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [row] } as never);

    const configuration = await getLeagueConfigurationForUser(row.user_id);

    expect(configuration).toMatchObject({
      id: row.id,
      userId: row.user_id,
      name: "Home League",
      scoringPreset: "half_ppr",
      rosterSlots: { wr: 3, superflex: 0, bench: 6 },
    });
    expect(vi.mocked(query).mock.calls[0]?.[1]).toEqual([row.user_id]);
  });

  it("scopes ID retrieval to the owning user", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [row] } as never);

    await getLeagueConfigurationByIdForUser(row.id, row.user_id);

    expect(vi.mocked(query).mock.calls[0]?.[1]).toEqual([row.id, row.user_id]);
  });

  it("upserts one editable configuration per user", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [row] } as never);

    await upsertLeagueConfiguration(row.user_id, {
      ...DEFAULT_LEAGUE_CONFIGURATION,
      name: row.name,
    });

    const [sql, values] = vi.mocked(query).mock.calls[0]!;
    expect(sql).toContain("on conflict (user_id) do update");
    expect(values?.slice(0, 6)).toEqual([
      row.user_id,
      row.name,
      12,
      "snake",
      1,
      "ppr",
    ]);
  });
});
