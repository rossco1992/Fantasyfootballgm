import { beforeEach, describe, expect, it, vi } from "vitest";

import { refreshFantasyProsAction } from "@/app/fantasypros/actions";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { refreshFantasyProsData } from "@/services/fantasypros-refresh";

const { redirect, revalidatePath } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/session", () => ({ requireAuthenticatedUser: vi.fn() }));
vi.mock("@/services/fantasypros-refresh", () => ({
  refreshFantasyProsData: vi.fn(),
}));

const outcome = {
  runId: "11111111-1111-4111-8111-111111111111",
  snapshotId: "22222222-2222-4222-8222-222222222222",
  status: "succeeded" as const,
  duplicate: false,
  recordsReceived: 12,
  recordsImported: 12,
  recordsRejected: 0,
  unmatchedPlayerCount: 0,
  playerIdentitiesReceived: 5,
  playerIdentitiesImported: 5,
  gamesReceived: 0,
  gamesImported: 0,
  coverageGaps: [],
  error: null,
};

describe("FantasyPros refresh action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthenticatedUser).mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      email: "gm@example.com",
    });
  });

  it("refreshes authenticated data without accepting an API key", async () => {
    vi.mocked(refreshFantasyProsData).mockResolvedValue(outcome);
    const formData = new FormData();
    formData.set("season", "2026");
    formData.set("scoring", "ppr");

    await expect(refreshFantasyProsAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard?message=FantasyPros%20refreshed%20%C2%B7%205%20players%20%C2%B7%2012%20data%20records",
    );
    expect(refreshFantasyProsData).toHaveBeenCalledWith({
      season: "2026",
      week: null,
      scoring: "ppr",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("returns a safe error without leaking provider details", async () => {
    vi.mocked(refreshFantasyProsData).mockRejectedValue(
      new Error("HTTP 401 secret details"),
    );
    const formData = new FormData();
    formData.set("season", "2026");

    await expect(refreshFantasyProsAction(formData)).rejects.toThrow(
      /Verify%20the%20Vercel%20API%20key/,
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
