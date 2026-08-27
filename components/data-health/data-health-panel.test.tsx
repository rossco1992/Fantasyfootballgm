import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataHealthPanel } from "@/components/data-health/data-health-panel";

vi.mock("@/app/data-health/actions", () => ({
  resolvePlayerMatchAction: vi.fn(),
}));

describe("DataHealthPanel", () => {
  it("shows provider health and safe manual match candidates", () => {
    render(
      <DataHealthPanel
        summary={{
          providers: [
            {
              providerId: "11111111-1111-4111-8111-111111111111",
              providerSlug: "fixture-data",
              providerName: "Fixture Data",
              lastAttemptAt: new Date("2026-08-26T12:00:00Z"),
              lastSuccessAt: new Date("2026-08-26T12:00:00Z"),
              lastStatus: "succeeded",
              staleAfterSeconds: 86400,
              consecutiveFailures: 0,
              unresolvedPlayerCount: 1,
              status: "current",
            },
          ],
          unresolvedPlayerCount: 1,
          playerOptions: [],
          unresolvedMatches: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              providerId: "11111111-1111-4111-8111-111111111111",
              providerSlug: "fixture-data",
              providerName: "Fixture Data",
              externalPlayerId: "external-1",
              reason: "ambiguous",
              evidence: { fullName: "Example Player" },
              occurrences: 1,
              firstSeenAt: new Date("2026-08-26T12:00:00Z"),
              lastSeenAt: new Date("2026-08-26T12:00:00Z"),
              candidates: [
                {
                  id: "33333333-3333-4333-8333-333333333333",
                  fullName: "Example Player",
                  position: "RB",
                  nflTeam: "NYJ",
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Fixture Data")).toBeVisible();
    expect(screen.getByText("current")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Match Example Player (RB · NYJ)",
      }),
    ).toBeEnabled();
  });

  it("shows a clean review queue", () => {
    render(
      <DataHealthPanel
        summary={{
          providers: [],
          unresolvedPlayerCount: 0,
          unresolvedMatches: [],
          playerOptions: [],
        }}
      />,
    );
    expect(screen.getByText("No player identities need review.")).toBeVisible();
  });

  it("lets an operator select a canonical player when matching found no candidates", () => {
    render(
      <DataHealthPanel
        summary={{
          providers: [],
          unresolvedPlayerCount: 1,
          playerOptions: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              fullName: "Historical Runner",
              position: "RB",
              nflTeam: null,
              byeWeek: null,
              status: "inactive",
              createdAt: new Date("2026-08-26T12:00:00Z"),
              updatedAt: new Date("2026-08-26T12:00:00Z"),
            },
          ],
          unresolvedMatches: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              providerId: "11111111-1111-4111-8111-111111111111",
              providerSlug: "nflverse",
              providerName: "nflverse",
              externalPlayerId: "00-unknown",
              reason: "unmatched",
              evidence: {},
              occurrences: 1,
              firstSeenAt: new Date("2026-08-26T12:00:00Z"),
              lastSeenAt: new Date("2026-08-26T12:00:00Z"),
              candidates: [],
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Select the canonical player" }),
    ).toContainHTML("Historical Runner");
    expect(screen.getByRole("button", { name: "Save match" })).toBeEnabled();
  });
});
