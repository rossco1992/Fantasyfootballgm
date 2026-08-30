import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FantasyDataPanel } from "@/components/data/fantasy-data-panel";

vi.mock("@/app/csv-import/actions", () => ({ importCsvFilesAction: vi.fn() }));
vi.mock("@/app/fantasypros/actions", () => ({
  refreshFantasyProsAction: vi.fn(),
}));

describe("FantasyDataPanel", () => {
  it("keeps FantasyPros refresh primary and CSV upload as a backup", () => {
    render(<FantasyDataPanel defaultScoring="half_ppr" season={2026} />);

    expect(
      screen.getByRole("button", { name: "Refresh FantasyPros data" }),
    ).toBeEnabled();
    expect(screen.getByText("Upload CSV backup")).toBeVisible();
    expect(screen.getByLabelText(/CSV files/)).toHaveAttribute("multiple");
    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
  });
});
