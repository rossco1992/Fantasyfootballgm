import { describe, expect, it } from "vitest";

import {
  draftOverallPick,
  draftPickCoordinates,
  nextOpenOverallPick,
} from "@/domain/draft";

describe("draft pick coordinates", () => {
  it("reverses team order in even snake rounds", () => {
    expect(draftPickCoordinates(1, 12, "snake")).toMatchObject({
      round: 1,
      pickInRound: 1,
      fantasyTeamSlot: 1,
    });
    expect(draftPickCoordinates(13, 12, "snake")).toMatchObject({
      round: 2,
      pickInRound: 1,
      fantasyTeamSlot: 12,
    });
    expect(draftPickCoordinates(24, 12, "snake")).toMatchObject({
      round: 2,
      pickInRound: 12,
      fantasyTeamSlot: 1,
    });
  });

  it("keeps team order fixed for a linear draft", () => {
    expect(draftPickCoordinates(13, 12, "linear").fantasyTeamSlot).toBe(1);
  });

  it("maps a keeper's round and team slot to its snake pick", () => {
    expect(draftOverallPick(4, 3, 12, "snake")).toBe(46);
    expect(draftPickCoordinates(46, 12, "snake").fantasyTeamSlot).toBe(3);
  });

  it("skips drafted and keeper-reserved picks", () => {
    expect(nextOpenOverallPick([1, 2, 4], 6)).toBe(3);
    expect(nextOpenOverallPick([1, 2, 3], 3)).toBeNull();
  });
});
