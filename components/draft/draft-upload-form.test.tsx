import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DraftUploadForm } from "@/components/draft/draft-upload-form";

describe("DraftUploadForm", () => {
  it("keeps the player CSV update independent from FantasyPros", () => {
    render(
      <DraftUploadForm
        action={vi.fn()}
        leagueId="league-a"
        scoring="ppr"
        season={2026}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Upload CSV files" }),
    ).toBeVisible();
    expect(screen.getByText("No files selected")).toBeVisible();
    expect(
      screen.getByText(/Select up to 2 CSVs.*combined into one player pool/),
    ).toBeVisible();
  });

  it("shows both selected CSV filenames before submitting", () => {
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
        files: [
          new File(["Player,Pos"], "latest-rankings.csv"),
          new File(["Player,Pos"], "latest-projections.csv"),
        ],
      },
    });

    expect(
      screen.getByText(/latest-rankings\.csv \+ latest-projections\.csv/),
    ).toBeVisible();
  });
});
