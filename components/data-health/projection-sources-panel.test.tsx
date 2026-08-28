import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectionSourcesPanel } from "@/components/data-health/projection-sources-panel";

vi.mock("@/app/projection-sources/actions", () => ({
  importProjectionCsvAction: vi.fn(),
  refreshProjectionSourcesAction: vi.fn(),
}));

describe("ProjectionSourcesPanel", () => {
  it("shows configured APIs and the CSV fallback", () => {
    render(
      <ProjectionSourcesPanel
        configuredSources={["FantasyPros"]}
        season={2026}
      />,
    );
    expect(screen.getByText(/Configured APIs: FantasyPros/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Refresh projections" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Import CSV" })).toBeEnabled();
    expect(screen.getByLabelText("CSV export")).toHaveAttribute(
      "accept",
      ".csv,text/csv",
    );
  });
});
