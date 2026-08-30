import { describe, expect, it } from "vitest";

import { draftPickCoordinates } from "@/domain/draft";

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
});
