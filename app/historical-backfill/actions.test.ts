import { beforeEach, describe, expect, it, vi } from "vitest";

import { startHistoricalBackfillAction } from "@/app/historical-backfill/actions";
import { HistoricalBackfillValidationError } from "@/domain/historical-backfill";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { backfillNflverseHistory } from "@/services/historical-backfill";

const { redirect, revalidatePath } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/session", () => ({ requireAuthenticatedUser: vi.fn() }));
vi.mock("@/services/historical-backfill", () => ({
  backfillNflverseHistory: vi.fn(),
}));

describe("historical backfill action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthenticatedUser).mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "gm@example.com",
    });
  });

  it("starts an authenticated bounded backfill", async () => {
    vi.mocked(backfillNflverseHistory).mockResolvedValue({
      status: "succeeded",
      scopes: [],
      skipped: 1,
      succeeded: 3,
      partial: 0,
      failed: 0,
    });
    const formData = new FormData();
    formData.set("season", "2025");
    formData.set("startWeek", "1");
    formData.set("endWeek", "4");

    await expect(startHistoricalBackfillAction(formData)).rejects.toThrow(
      /REDIRECT:\/dashboard\?message=3%20loaded/,
    );
    expect(backfillNflverseHistory).toHaveBeenCalledWith(
      {
        season: 2025,
        startWeek: 1,
        endWeek: 4,
        force: false,
      },
      "on_demand",
      { maxWeeks: 4 },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("returns a useful validation error without revalidating", async () => {
    vi.mocked(backfillNflverseHistory).mockRejectedValue(
      new HistoricalBackfillValidationError(
        "Web backfills are limited to 4 weeks at a time.",
      ),
    );
    await expect(startHistoricalBackfillAction(new FormData())).rejects.toThrow(
      /REDIRECT:\/dashboard\?error=Web%20backfills/,
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
