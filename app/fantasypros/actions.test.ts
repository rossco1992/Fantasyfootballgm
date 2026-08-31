import { beforeEach, describe, expect, it, vi } from "vitest";

import { refreshFantasyProsAction } from "@/app/fantasypros/actions";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { refreshFantasyProsData } from "@/services/fantasypros-refresh";
import { retrieveLeagueConfiguration } from "@/services/league-configurations";
import { generateProjectionConsensus } from "@/services/projection-consensus";

const { redirect, revalidatePath } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/session", () => ({ requireAuthenticatedUser: vi.fn() }));
vi.mock("@/services/fantasypros-refresh", () => ({
  refreshFantasyProsData: vi.fn(),
}));
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
  recordsReceived: 12,
  recordsImported: 12,
  recordsRejected: 0,
  unmatchedPlayerCount: 0,
  playerIdentitiesReceived: 5,
  playerIdentitiesImported: 5,
  gamesReceived: 0,
  gamesImported: 0,
  coverageGaps: [],
  error: null,
};

describe("FantasyPros refresh action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthenticatedUser).mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      email: "gm@example.com",
    });
    vi.mocked(retrieveLeagueConfiguration).mockResolvedValue(null);
  });

  it("refreshes authenticated data without accepting an API key", async () => {
    vi.mocked(refreshFantasyProsData).mockResolvedValue(outcome);
    const formData = new FormData();
    formData.set("season", "2026");
    formData.set("scoring", "ppr");

    await expect(refreshFantasyProsAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard?message=FantasyPros%20refreshed%20%C2%B7%205%20players%20%C2%B7%2012%20data%20records",
    );
    expect(refreshFantasyProsData).toHaveBeenCalledWith({
      season: 2026,
      week: null,
      scoring: "ppr",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("regenerates league projection consensus after a refresh", async () => {
    vi.mocked(refreshFantasyProsData).mockResolvedValue(outcome);
    vi.mocked(retrieveLeagueConfiguration).mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      userId: "33333333-3333-4333-8333-333333333333",
      name: "My League",
      teamCount: 12,
      leagueFormat: "redraft",
      maxKeepersPerTeam: 0,
      draftType: "snake",
      draftPosition: 1,
      scoringPreset: "half_ppr",
      rosterSlots: {
        qb: 1,
        rb: 2,
        wr: 2,
        te: 1,
        flex: 1,
        superflex: 0,
        k: 1,
        dst: 1,
        bench: 6,
      },
      createdAt: new Date("2026-08-30T12:00:00Z"),
      updatedAt: new Date("2026-08-30T12:00:00Z"),
    });
    const formData = new FormData();
    formData.set("season", "2026");
    formData.set("scoring", "half_ppr");

    await expect(refreshFantasyProsAction(formData)).rejects.toThrow(
      /REDIRECT:\/dashboard\?message=/,
    );
    expect(generateProjectionConsensus).toHaveBeenCalledWith({
      leagueId: "44444444-4444-4444-8444-444444444444",
      userId: "33333333-3333-4333-8333-333333333333",
      season: 2026,
      week: null,
      horizon: "preseason",
    });
  });

  it("returns a safe error without leaking provider details", async () => {
    vi.mocked(refreshFantasyProsData).mockRejectedValue(
      new Error("HTTP 401 secret details"),
    );
    const formData = new FormData();
    formData.set("season", "2026");

    await expect(refreshFantasyProsAction(formData)).rejects.toThrow(
      /Verify%20the%20Vercel%20API%20key/,
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
