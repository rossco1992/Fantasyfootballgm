import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DraftUploadForm } from "@/components/draft/draft-upload-form";

describe("DraftUploadForm", () => {
  it("shows one clear action for the CSV and FantasyPros update", () => {
    render(
      <DraftUploadForm
        action={vi.fn()}
        leagueId="league-a"
        scoring="ppr"
        season={2026}
      />,
    );

    expect(screen.getByRole("button", { name: "Update both" })).toBeVisible();
    expect(screen.getByText("No file selected")).toBeVisible();
    expect(
      screen.getByText(
        /One tap replaces the player CSV and refreshes FantasyPros/,
      ),
    ).toBeVisible();
  });

  it("shows the selected CSV filename before submitting", () => {
    render(
      <DraftUploadForm
        action={vi.fn()}
        leagueId="league-a"
        scoring="ppr"
        season={2026}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Choose CSV/), {
      target: {
        files: [new File(["Player,Pos"], "latest-rankings.csv")],
      },
    });

    expect(screen.getByText("latest-rankings.csv")).toBeVisible();
  });
});
