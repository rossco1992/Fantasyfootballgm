import { beforeEach, describe, expect, it, vi } from "vitest";

import { refreshPlayerCatalogAction } from "@/app/player-catalog/actions";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { refreshSleeperPlayerCatalog } from "@/services/player-catalog";

const { revalidatePath } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/session", () => ({
  requireAuthenticatedUser: vi.fn(),
}));
vi.mock("@/services/player-catalog", () => ({
  currentNFLSeason: () => 2026,
  refreshSleeperPlayerCatalog: vi.fn(),
}));

describe("player catalog actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthenticatedUser).mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "gm@example.com",
    });
  });

  it("requires authentication and reports a successful refresh", async () => {
    vi.mocked(refreshSleeperPlayerCatalog).mockResolvedValue({
      kind: "refreshed",
      outcome: {
        runId: "11111111-1111-4111-8111-111111111111",
        snapshotId: "22222222-2222-4222-8222-222222222222",
        status: "succeeded",
        duplicate: false,
        recordsReceived: 0,
        recordsImported: 0,
        recordsRejected: 0,
        unmatchedPlayerCount: 0,
        playerIdentitiesReceived: 642,
        playerIdentitiesImported: 642,
        gamesReceived: 0,
        gamesImported: 0,
        coverageGaps: [],
        error: null,
      },
    });

    await expect(
      refreshPlayerCatalogAction({ status: "idle" }),
    ).resolves.toEqual({
      status: "success",
      message: "Player data refreshed: 642 records imported.",
    });
    expect(requireAuthenticatedUser).toHaveBeenCalledOnce();
    expect(refreshSleeperPlayerCatalog).toHaveBeenCalledWith(2026);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("keeps the last valid pool available when refresh fails", async () => {
    vi.mocked(refreshSleeperPlayerCatalog).mockRejectedValue(
      new Error("provider unavailable"),
    );

    await expect(
      refreshPlayerCatalogAction({ status: "idle" }),
    ).resolves.toMatchObject({ status: "error" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
