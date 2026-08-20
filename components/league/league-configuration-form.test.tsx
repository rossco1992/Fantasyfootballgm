import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LeagueConfigurationForm } from "@/components/league/league-configuration-form";
import { DEFAULT_LEAGUE_CONFIGURATION } from "@/domain/league-configuration";

vi.mock("@/app/league/actions", () => ({
  INITIAL_LEAGUE_FORM_STATE: { status: "idle" },
  saveLeagueConfigurationAction: vi.fn(),
}));

describe("LeagueConfigurationForm", () => {
  it("captures every required league setting", () => {
    render(
      <LeagueConfigurationForm
        initialConfiguration={DEFAULT_LEAGUE_CONFIGURATION}
        isEditing={false}
      />,
    );

    expect(screen.getByLabelText("League name")).toBeInTheDocument();
    expect(screen.getByLabelText("Team count")).toBeInTheDocument();
    expect(screen.getByLabelText("League format")).toHaveValue("redraft");
    expect(
      screen.queryByLabelText("Maximum keepers per team"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Draft type")).toBeInTheDocument();
    expect(screen.getByLabelText("Your draft position")).toBeInTheDocument();
    expect(screen.getByLabelText("Scoring preset")).toBeInTheDocument();
    for (const label of [
      "QB",
      "RB",
      "WR",
      "TE",
      "FLEX",
      "SUPERFLEX",
      "K",
      "DST",
      "Bench",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Create league" })).toBeVisible();
  });

  it("captures the maximum when keeper format is selected", () => {
    render(
      <LeagueConfigurationForm
        initialConfiguration={DEFAULT_LEAGUE_CONFIGURATION}
        isEditing={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("League format"), {
      target: { value: "keeper" },
    });

    expect(screen.getByLabelText("Maximum keepers per team")).toHaveValue(1);
  });

  it("loads existing settings for editing", () => {
    render(
      <LeagueConfigurationForm
        initialConfiguration={{
          ...DEFAULT_LEAGUE_CONFIGURATION,
          name: "Keeper League",
          teamCount: 10,
          leagueFormat: "keeper",
          maxKeepersPerTeam: 3,
          draftPosition: 7,
          scoringPreset: "half_ppr",
          rosterSlots: {
            ...DEFAULT_LEAGUE_CONFIGURATION.rosterSlots,
            superflex: 1,
            k: 0,
          },
        }}
        isEditing
      />,
    );

    expect(screen.getByLabelText("League name")).toHaveValue("Keeper League");
    expect(screen.getByLabelText("Team count")).toHaveValue(10);
    expect(screen.getByLabelText("League format")).toHaveValue("keeper");
    expect(screen.getByLabelText("Maximum keepers per team")).toHaveValue(3);
    expect(screen.getByLabelText("Your draft position")).toHaveValue(7);
    expect(screen.getByLabelText("Scoring preset")).toHaveValue("half_ppr");
    expect(screen.getByLabelText("SUPERFLEX")).toHaveValue(1);
    expect(screen.getByLabelText("K")).toHaveValue(0);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeVisible();
  });
});
