import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listOpenPlayerMatchReviews,
  listProviderDataHealth,
  resolvePlayerMatchReview,
} from "@/db/repositories/data-health";
import {
  applyManualPlayerMatch,
  retrieveDataHealthSummary,
} from "@/services/data-health";

vi.mock("@/db/repositories/data-health", () => ({
  listOpenPlayerMatchReviews: vi.fn(),
  listProviderDataHealth: vi.fn(),
  resolvePlayerMatchReview: vi.fn(),
}));

const now = new Date("2026-08-26T12:00:00Z");

describe("data health service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("classifies current, stale, failed, and unloaded providers", async () => {
    vi.mocked(listProviderDataHealth).mockResolvedValue([
      {
        providerId: "11111111-1111-4111-8111-111111111111",
        providerSlug: "current",
        providerName: "Current",
        lastAttemptAt: new Date("2026-08-26T11:00:00Z"),
        lastSuccessAt: new Date("2026-08-26T11:00:00Z"),
        lastStatus: "succeeded",
        staleAfterSeconds: 86400,
        consecutiveFailures: 0,
        unresolvedPlayerCount: 1,
      },
      {
        providerId: "22222222-2222-4222-8222-222222222222",
        providerSlug: "stale",
        providerName: "Stale",
        lastAttemptAt: new Date("2026-08-20T11:00:00Z"),
        lastSuccessAt: new Date("2026-08-20T11:00:00Z"),
        lastStatus: "succeeded",
        staleAfterSeconds: 86400,
        consecutiveFailures: 0,
        unresolvedPlayerCount: 2,
      },
      {
        providerId: "33333333-3333-4333-8333-333333333333",
        providerSlug: "failed",
        providerName: "Failed",
        lastAttemptAt: now,
        lastSuccessAt: null,
        lastStatus: "failed",
        staleAfterSeconds: 86400,
        consecutiveFailures: 2,
        unresolvedPlayerCount: 0,
      },
      {
        providerId: "44444444-4444-4444-8444-444444444444",
        providerSlug: "new",
        providerName: "New",
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastStatus: null,
        staleAfterSeconds: null,
        consecutiveFailures: 0,
        unresolvedPlayerCount: 0,
      },
    ]);
    vi.mocked(listOpenPlayerMatchReviews).mockResolvedValue([]);

    const result = await retrieveDataHealthSummary(() => now);

    expect(result.providers.map((provider) => provider.status)).toEqual([
      "current",
      "stale",
      "failed",
      "not_loaded",
    ]);
    expect(result.unresolvedPlayerCount).toBe(3);
  });

  it("records the authenticated user when applying a manual match", async () => {
    await applyManualPlayerMatch({
      userId: "11111111-1111-4111-8111-111111111111",
      reviewId: "22222222-2222-4222-8222-222222222222",
      playerId: "33333333-3333-4333-8333-333333333333",
      clock: () => now,
    });

    expect(resolvePlayerMatchReview).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedAt: now }),
    );
  });
});
