import { describe, expect, it } from "vitest";

import { manualRosterPlayerInputSchema } from "@/domain/roster";

const baseInput = {
  fullName: "Christian McCaffrey",
  position: "RB" as const,
  nflTeam: "SF",
  fantasyTeamName: "My Team",
  acquisitionType: "drafted" as const,
  isKeeper: false,
  originalDraftRound: null,
};

describe("manualRosterPlayerInputSchema", () => {
  it("accepts a manually entered roster player", () => {
    expect(manualRosterPlayerInputSchema.parse(baseInput)).toEqual(baseInput);
  });

  it("requires prior draft history for a keeper", () => {
    const result = manualRosterPlayerInputSchema.safeParse({
      ...baseInput,
      isKeeper: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.originalDraftRound).toEqual([
        "Enter the player's prior-year draft round.",
      ]);
    }
  });

  it("does not invent an unresolved waiver keeper cost", () => {
    const result = manualRosterPlayerInputSchema.safeParse({
      ...baseInput,
      acquisitionType: "waiver",
      isKeeper: true,
      originalDraftRound: 8,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.acquisitionType?.[0]).toContain(
        "not configured",
      );
    }
  });
});
