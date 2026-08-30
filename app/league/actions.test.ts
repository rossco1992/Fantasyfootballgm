import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveLeagueConfigurationAction } from "@/app/league/actions";
import { INITIAL_LEAGUE_FORM_STATE } from "@/app/league/form-state";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { saveLeagueConfiguration } from "@/services/league-configurations";

const { revalidatePath } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/session", () => ({ requireAuthenticatedUser: vi.fn() }));
vi.mock("@/services/league-configurations", () => ({
  saveLeagueConfiguration: vi.fn(),
}));

function validLeagueFormData(): FormData {
  const formData = new FormData();
  formData.set("name", "Home League");
  formData.set("teamCount", "12");
  formData.set("leagueFormat", "redraft");
  formData.set("maxKeepersPerTeam", "0");
  formData.set("draftType", "snake");
  formData.set("draftPosition", "1");
  formData.set("scoringPreset", "ppr");
  formData.set("qb", "1");
  formData.set("rb", "2");
  formData.set("wr", "2");
  formData.set("te", "1");
  formData.set("flex", "1");
  formData.set("superflex", "0");
  formData.set("k", "1");
  formData.set("dst", "1");
  formData.set("bench", "6");
  return formData;
}

describe("league configuration action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthenticatedUser).mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "gm@example.com",
    });
  });

  it("returns a completed success state after saving", async () => {
    vi.mocked(saveLeagueConfiguration).mockResolvedValue({} as never);

    const result = await saveLeagueConfigurationAction(
      INITIAL_LEAGUE_FORM_STATE,
      validLeagueFormData(),
    );

    expect(result).toEqual({
      status: "success",
      message: "League settings saved.",
    });
    expect(saveLeagueConfiguration).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        name: "Home League",
        teamCount: 12,
        rosterSlots: expect.objectContaining({ bench: 6 }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("returns validation errors without starting a save", async () => {
    const formData = validLeagueFormData();
    formData.set("draftPosition", "13");

    const result = await saveLeagueConfigurationAction(
      INITIAL_LEAGUE_FORM_STATE,
      formData,
    );

    expect(result).toMatchObject({
      status: "error",
      message: "Correct the highlighted league settings.",
      fieldErrors: {
        draftPosition: ["Draft position cannot exceed the number of teams."],
      },
    });
    expect(saveLeagueConfiguration).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a recoverable error when persistence fails", async () => {
    vi.mocked(saveLeagueConfiguration).mockRejectedValue(
      new Error("database details"),
    );

    const result = await saveLeagueConfigurationAction(
      INITIAL_LEAGUE_FORM_STATE,
      validLeagueFormData(),
    );

    expect(result).toEqual({
      status: "error",
      message: "League settings could not be saved. Try again.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
