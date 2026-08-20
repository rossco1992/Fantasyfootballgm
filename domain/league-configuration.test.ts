import { describe, expect, it } from "vitest";

import {
  DEFAULT_LEAGUE_CONFIGURATION,
  SCORING_PRESETS,
  leagueConfigurationInputSchema,
} from "@/domain/league-configuration";

describe("league configuration validation", () => {
  it.each(SCORING_PRESETS)("accepts the %s scoring preset", (scoringPreset) => {
    expect(
      leagueConfigurationInputSchema.safeParse({
        ...DEFAULT_LEAGUE_CONFIGURATION,
        scoringPreset,
      }).success,
    ).toBe(true);
  });

  it("rejects a draft position outside the league", () => {
    const result = leagueConfigurationInputSchema.safeParse({
      ...DEFAULT_LEAGUE_CONFIGURATION,
      teamCount: 10,
      draftPosition: 11,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.draftPosition).toContain(
        "Draft position cannot exceed the number of teams.",
      );
    }
  });

  it("rejects leagues without a starting lineup", () => {
    const result = leagueConfigurationInputSchema.safeParse({
      ...DEFAULT_LEAGUE_CONFIGURATION,
      rosterSlots: {
        qb: 0,
        rb: 0,
        wr: 0,
        te: 0,
        flex: 0,
        superflex: 0,
        k: 0,
        dst: 0,
        bench: 6,
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects fractional and oversized roster values", () => {
    expect(
      leagueConfigurationInputSchema.safeParse({
        ...DEFAULT_LEAGUE_CONFIGURATION,
        rosterSlots: {
          ...DEFAULT_LEAGUE_CONFIGURATION.rosterSlots,
          rb: 1.5,
        },
      }).success,
    ).toBe(false);

    expect(
      leagueConfigurationInputSchema.safeParse({
        ...DEFAULT_LEAGUE_CONFIGURATION,
        rosterSlots: {
          qb: 10,
          rb: 10,
          wr: 10,
          te: 10,
          flex: 1,
          superflex: 0,
          k: 0,
          dst: 0,
          bench: 0,
        },
      }).success,
    ).toBe(false);
  });
});
