import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PersonalDraftSettingsForm } from "@/components/draft/personal-draft-settings-form";

const props = {
  action: vi.fn(),
  leagueId: "league-a",
  draftPosition: 6,
  teamCount: 12,
  leagueFormat: "keeper" as const,
  totalRounds: 15,
  keeper: null,
  players: [
    { id: "player-a", fullName: "Example Runner", position: "RB", rank: 4 },
  ],
  locked: false,
};

describe("PersonalDraftSettingsForm", () => {
  it("defaults to no keeper and hides keeper fields", () => {
    render(<PersonalDraftSettingsForm {...props} />);
    expect(screen.getByLabelText("Are you keeping a player?")).toHaveValue(
      "none",
    );
    expect(
      screen.queryByLabelText("Your keeper player"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Keeper draft round"),
    ).not.toBeInTheDocument();
  });

  it("shows keeper player and round after selecting a keeper", () => {
    render(<PersonalDraftSettingsForm {...props} />);
    fireEvent.change(screen.getByLabelText("Are you keeping a player?"), {
      target: { value: "keeper" },
    });
    expect(screen.getByLabelText("Your keeper player")).toBeVisible();
    expect(screen.getByLabelText("Keeper draft round")).toBeVisible();
  });

  it("starts in keeper mode when a keeper is already saved", () => {
    render(
      <PersonalDraftSettingsForm
        {...props}
        keeper={{ playerId: "player-a", round: 5 }}
      />,
    );
    expect(screen.getByLabelText("Are you keeping a player?")).toHaveValue(
      "keeper",
    );
    expect(screen.getByLabelText("Your keeper player")).toHaveValue("player-a");
    expect(screen.getByLabelText("Keeper draft round")).toHaveValue(5);
  });
});
