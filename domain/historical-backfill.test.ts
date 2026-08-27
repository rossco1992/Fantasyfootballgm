import { describe, expect, it } from "vitest";

import {
  latestCompletedNFLSeason,
  validateHistoricalBackfillRange,
  weeksInRange,
} from "@/domain/historical-backfill";

describe("historical backfill range", () => {
  it("builds a bounded inclusive week range for completed seasons", () => {
    const range = validateHistoricalBackfillRange(
      { season: 2025, startWeek: 2, endWeek: 4, force: false },
      { latestSeason: 2025, maxWeeks: 4 },
    );
    expect(weeksInRange(range)).toEqual([2, 3, 4]);
  });

  it("rejects future seasons and oversized web requests", () => {
    expect(() =>
      validateHistoricalBackfillRange(
        { season: 2026, startWeek: 1, endWeek: 1, force: false },
        { latestSeason: 2025 },
      ),
    ).toThrow(/through 2025/);
    expect(() =>
      validateHistoricalBackfillRange(
        { season: 2025, startWeek: 1, endWeek: 5, force: false },
        { latestSeason: 2025, maxWeeks: 4 },
      ),
    ).toThrow(/limited to 4 weeks/);
  });

  it("uses the prior calendar year as the latest completed season", () => {
    expect(latestCompletedNFLSeason(new Date("2026-08-27T12:00:00Z"))).toBe(
      2025,
    );
    expect(latestCompletedNFLSeason(new Date("2027-01-01T12:00:00Z"))).toBe(
      2025,
    );
    expect(latestCompletedNFLSeason(new Date("2027-02-01T12:00:00Z"))).toBe(
      2026,
    );
  });
});
