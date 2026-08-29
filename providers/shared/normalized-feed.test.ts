import { describe, expect, it } from "vitest";

import { normalizeProjectionStats } from "@/providers/shared/normalized-feed";

describe("normalized projection stats", () => {
  it("maps common snake-case and abbreviated provider fields to canonical names", () => {
    expect(
      normalizeProjectionStats({
        pass_yds: 4200,
        pass_tds: 30,
        rush_yds: 350,
        rec: 4,
        field_goals_made: 28,
      }),
    ).toEqual({
      passingYards: 4200,
      passingTouchdowns: 30,
      rushingYards: 350,
      receptions: 4,
      fieldGoalsMade: 28,
    });
  });
});
