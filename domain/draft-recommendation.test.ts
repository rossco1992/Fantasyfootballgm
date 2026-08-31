import { describe, expect, it } from "vitest";

import {
  type DraftRecommendationCandidate,
  recommendDraftPlayers,
} from "@/domain/draft-recommendation";
import { DEFAULT_LEAGUE_CONFIGURATION } from "@/domain/league-configuration";

const league = {
  ...DEFAULT_LEAGUE_CONFIGURATION,
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  scoringPreset: "half_ppr" as const,
  createdAt: new Date("2026-08-30T12:00:00Z"),
  updatedAt: new Date("2026-08-30T12:00:00Z"),
};

function player(
  playerId: string,
  fullName: string,
  position: DraftRecommendationCandidate["position"],
  points: number | null,
  rank: number,
  overrides: Partial<DraftRecommendationCandidate> = {},
): DraftRecommendationCandidate {
  return {
    playerId,
    fullName,
    position,
    nflTeam: "SF",
    status: "active",
    yahooRank: rank,
    yahooAdp: rank,
    consensusPoints: points,
    confidence: points === null ? null : 0.8,
    sourceCount: points === null ? 0 : 2,
    ...overrides,
  };
}

describe("draft recommendation engine", () => {
  it("combines projection value, scarcity, availability, and roster fit", () => {
    const candidates = [
      player(
        "00000000-0000-4000-8000-000000000001",
        "Elite Runner",
        "RB",
        280,
        8,
      ),
      player(
        "00000000-0000-4000-8000-000000000002",
        "Next Runner",
        "RB",
        230,
        24,
      ),
      player("00000000-0000-4000-8000-000000000003", "Wide One", "WR", 260, 10),
      player("00000000-0000-4000-8000-000000000004", "Wide Two", "WR", 255, 12),
    ];

    const result = recommendDraftPlayers({
      candidates,
      league,
      rosterPositionCounts: { WR: 2 },
      currentOverallPick: 8,
      nextUserOverallPick: 17,
    });

    expect(result.dataMode).toBe("projection_consensus");
    expect(result.picksUntilUser).toBe(9);
    expect(result.recommendations[0]).toMatchObject({
      fullName: "Elite Runner",
      position: "RB",
      rank: 1,
    });
    expect(result.recommendations[0]?.reasons).toContain(
      "Fills an open starting RB slot.",
    );
    expect(result.recommendations[0]?.factors).toEqual(
      expect.objectContaining({
        rosterFit: 100,
        projectedValue: expect.any(Number),
        scarcity: expect.any(Number),
        availabilityRisk: expect.any(Number),
      }),
    );
  });

  it("falls back to Yahoo rank and ADP when projections are unavailable", () => {
    const result = recommendDraftPlayers({
      candidates: [
        player(
          "00000000-0000-4000-8000-000000000001",
          "Market One",
          "WR",
          null,
          4,
        ),
        player(
          "00000000-0000-4000-8000-000000000002",
          "Market Two",
          "WR",
          null,
          20,
        ),
      ],
      league,
      rosterPositionCounts: {},
      currentOverallPick: 1,
      nextUserOverallPick: 12,
    });

    expect(result.dataMode).toBe("market_only");
    expect(result.recommendations[0]?.fullName).toBe("Market One");
    expect(result.recommendations[0]?.reasons.join(" ")).toContain(
      "market-only recommendation",
    );
  });

  it("penalizes unavailable and seriously injured players", () => {
    const result = recommendDraftPlayers({
      candidates: [
        player(
          "00000000-0000-4000-8000-000000000001",
          "Healthy Player",
          "RB",
          250,
          10,
        ),
        player(
          "00000000-0000-4000-8000-000000000002",
          "Injured Player",
          "RB",
          270,
          8,
          { status: "injured_reserve" },
        ),
        player(
          "00000000-0000-4000-8000-000000000003",
          "Retired Player",
          "RB",
          400,
          1,
          { status: "retired" },
        ),
      ],
      league,
      rosterPositionCounts: {},
      currentOverallPick: 8,
      nextUserOverallPick: 17,
    });

    expect(result.recommendations.map((entry) => entry.fullName)).not.toContain(
      "Retired Player",
    );
    expect(
      result.recommendations.find(
        (entry) => entry.fullName === "Injured Player",
      )?.warning,
    ).toContain("injured reserve");
  });
});
