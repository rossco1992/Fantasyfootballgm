import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HistoricalBackfillPanel } from "@/components/data-health/historical-backfill-panel";

vi.mock("@/app/historical-backfill/actions", () => ({
  startHistoricalBackfillAction: vi.fn(),
}));

describe("HistoricalBackfillPanel", () => {
  it("shows exact week coverage and an authenticated activation form", () => {
    render(
      <HistoricalBackfillPanel
        summary={{
          firstSeason: 2025,
          latestSeason: 2025,
          weeks: Array.from({ length: 18 }, (_, index) => ({
            season: 2025,
            week: index + 1,
            status: index === 0 ? "succeeded" : "missing",
            recordsImported: index === 0 ? 620 : 0,
            unmatchedPlayerCount: 0,
            hasUsableSnapshot: index === 0,
          })),
        }}
      />,
    );

    expect(
      screen.getByText(
        "1 of 18 supported regular-season weeks are fully loaded.",
        {
          exact: false,
        },
      ),
    ).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: "Season" })).toHaveValue(
      2025,
    );
    expect(screen.getByRole("button", { name: "Load weeks" })).toBeEnabled();
    expect(screen.getByTitle(/Week 1: succeeded; 620 records/)).toBeVisible();
    expect(screen.getByTitle(/Week 2: missing/)).toBeVisible();
  });
});
