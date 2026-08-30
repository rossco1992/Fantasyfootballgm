import { describe, expect, it } from "vitest";

import {
  blendProjectionSources,
  calculateFantasyPoints,
  evaluateProjectionAccuracy,
  type ProjectionSource,
} from "@/domain/projection-consensus";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";

function source(
  providerSlug: string,
  projectedPoints: number,
  correlationGroup = providerSlug,
  overrides: Partial<ProjectionSource> = {},
): ProjectionSource {
  return {
    providerId: `${providerSlug === "a" ? "2" : providerSlug === "b" ? "3" : "4"}2222222-2222-4222-8222-222222222222`,
    providerSlug,
    snapshotId: `${providerSlug === "a" ? "5" : providerSlug === "b" ? "6" : "7"}3333333-3333-4333-8333-333333333333`,
    observedAt: new Date("2026-08-29T12:00:00.000Z"),
    projectedPoints,
    scoring: "ppr",
    stats: {},
    weight: 1,
    sourceFamily: providerSlug,
    correlationGroup,
    ...overrides,
  };
}

describe("projection consensus", () => {
  it("recalculates normalized stat lines under each league scoring preset", () => {
    const stats = {
      rushingYards: 70,
      rushingTouchdowns: 1,
      receptions: 6,
      receivingYards: 40,
    };

    expect(calculateFantasyPoints(stats, "standard")?.points).toBe(17);
    expect(calculateFantasyPoints(stats, "half_ppr")?.points).toBe(20);
    expect(calculateFantasyPoints(stats, "ppr")?.points).toBe(23);
  });

  it("gives a correlated source group one vote instead of double-counting it", () => {
    const result = blendProjectionSources({
      playerId: PLAYER_ID,
      position: "RB",
      scoring: "ppr",
      sources: [
        source("a", 10, "expert-consensus"),
        source("b", 20, "expert-consensus"),
        source("c", 40, "independent"),
      ],
    });

    expect(result?.consensusPoints).toBe(27.5);
    expect(result?.groupCount).toBe(2);
    expect(
      result?.components.map((component) => component.effectiveWeight),
    ).toEqual([0.25, 0.25, 0.5]);
  });

  it("uses normalized stats before a provider total and excludes mismatched totals", () => {
    const result = blendProjectionSources({
      playerId: PLAYER_ID,
      position: "WR",
      scoring: "ppr",
      sources: [
        source("a", 99, "a", {
          scoring: "standard",
          stats: { receptions: 5, receivingYards: 80 },
        }),
        source("b", 30, "b", { scoring: "standard" }),
      ],
    });

    expect(result?.consensusPoints).toBe(13);
    expect(result?.sourceCount).toBe(1);
    expect(result?.components[0]).toMatchObject({
      providerSlug: "a",
      pointsOrigin: "recalculated_stats",
      projectedPoints: 13,
    });
  });

  it("lowers confidence as source disagreement increases", () => {
    const agreed = blendProjectionSources({
      playerId: PLAYER_ID,
      position: "QB",
      scoring: "ppr",
      sources: [source("a", 20), source("b", 20), source("c", 20)],
    });
    const disagreed = blendProjectionSources({
      playerId: PLAYER_ID,
      position: "QB",
      scoring: "ppr",
      sources: [source("a", 5), source("b", 20), source("c", 35)],
    });

    expect(agreed?.confidence).toBe(1);
    expect(disagreed?.confidence).toBeLessThan(agreed?.confidence ?? 0);
    expect(disagreed?.rangePoints).toBe(30);
  });

  it("produces provider and consensus errors from the frozen snapshot", () => {
    const consensus = blendProjectionSources({
      playerId: PLAYER_ID,
      position: "TE",
      scoring: "ppr",
      sources: [source("a", 10), source("b", 14)],
    });
    if (!consensus) throw new Error("Expected a consensus result.");

    expect(evaluateProjectionAccuracy(consensus, 8)).toEqual([
      {
        sourceType: "consensus",
        providerSlug: null,
        predictedPoints: 12,
        actualPoints: 8,
        signedError: 4,
        absoluteError: 4,
        squaredError: 16,
      },
      {
        sourceType: "provider",
        providerSlug: "a",
        predictedPoints: 10,
        actualPoints: 8,
        signedError: 2,
        absoluteError: 2,
        squaredError: 4,
      },
      {
        sourceType: "provider",
        providerSlug: "b",
        predictedPoints: 14,
        actualPoints: 8,
        signedError: 6,
        absoluteError: 6,
        squaredError: 36,
      },
    ]);
  });
});
