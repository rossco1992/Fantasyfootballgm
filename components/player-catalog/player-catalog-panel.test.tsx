import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PlayerCatalogPanel } from "@/components/player-catalog/player-catalog-panel";

vi.mock("@/app/player-catalog/actions", () => ({
  refreshPlayerCatalogAction: vi.fn(),
}));

describe("PlayerCatalogPanel", () => {
  it("shows current catalog readiness and a refresh control", () => {
    render(
      <PlayerCatalogPanel
        lastSuccessAt="2026-08-26T12:00:00.000Z"
        playerCount={642}
        status="current"
      />,
    );

    expect(screen.getByText(/642 draftable players · Current/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Refresh player data" }),
    ).toBeEnabled();
  });

  it("makes an empty catalog visible", () => {
    render(
      <PlayerCatalogPanel
        lastSuccessAt={null}
        playerCount={0}
        status="not_loaded"
      />,
    );

    expect(screen.getByText(/0 draftable players · Not loaded/)).toBeVisible();
  });
});
