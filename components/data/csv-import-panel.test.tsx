import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CsvImportPanel } from "@/components/data/csv-import-panel";

vi.mock("@/app/csv-import/actions", () => ({
  importCsvFilesAction: vi.fn(),
}));

describe("CsvImportPanel", () => {
  it("offers one multi-file CSV upload workflow", () => {
    render(<CsvImportPanel defaultScoring="half_ppr" season={2026} />);

    expect(
      screen.getByRole("button", { name: "Upload CSV files" }),
    ).toBeEnabled();
    expect(screen.getByLabelText(/CSV files/)).toHaveAttribute("multiple");
    expect(screen.getByLabelText(/CSV files/)).toHaveAttribute(
      "accept",
      ".csv,text/csv",
    );
    expect(screen.getByLabelText("Scoring")).toHaveValue("half_ppr");
    expect(screen.queryByText(/API/i)).not.toBeInTheDocument();
  });
});
