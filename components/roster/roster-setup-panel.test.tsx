import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RosterSetupPanel } from "@/components/roster/roster-setup-panel";

vi.mock("@/app/roster/actions", () => ({
  addRosterPlayerAction: vi.fn(),
  removeRosterPlayerAction: vi.fn(),
}));

describe("RosterSetupPanel", () => {
  it("supports manual player and keeper setup", () => {
    render(
      <RosterSetupPanel
        assignments={[]}
        keeperLeague
        leagueId="11111111-1111-4111-8111-111111111111"
        maxKeepersPerTeam={1}
      />,
    );

    expect(screen.getByLabelText("Player name")).toBeInTheDocument();
    expect(screen.getByLabelText("Fantasy team")).toHaveValue("My Team");

    fireEvent.click(screen.getByLabelText("Keeper (1 max per team)"));

    expect(screen.getByLabelText(/Prior-year draft round/)).toBeInTheDocument();
    expect(
      screen.getByText("This same round becomes the keeper cost."),
    ).toBeVisible();
  });

  it("shows existing keeper assignments and their reserved round", () => {
    render(
      <RosterSetupPanel
        assignments={[
          {
            id: "22222222-2222-4222-8222-222222222222",
            leagueId: "11111111-1111-4111-8111-111111111111",
            playerId: "33333333-3333-4333-8333-333333333333",
            fullName: "Christian McCaffrey",
            position: "RB",
            nflTeam: "SF",
            playerStatus: "active",
            fantasyTeamName: "My Team",
            acquisitionType: "drafted",
            isKeeper: true,
            originalDraftSeason: 2025,
            originalDraftRound: 2,
            keeperSeason: 2026,
            keeperCostRound: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]}
        keeperLeague
        leagueId="11111111-1111-4111-8111-111111111111"
        maxKeepersPerTeam={1}
      />,
    );

    expect(screen.getByText("Christian McCaffrey")).toBeVisible();
    expect(screen.getByText("Keeper · Round 2")).toBeVisible();
  });
});
