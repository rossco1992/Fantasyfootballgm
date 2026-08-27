import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolvePlayerMatchAction } from "@/app/data-health/actions";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { applyManualPlayerMatch } from "@/services/data-health";

const { redirect, revalidatePath } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/session", () => ({
  requireAuthenticatedUser: vi.fn(),
}));
vi.mock("@/services/data-health", () => ({
  applyManualPlayerMatch: vi.fn(),
}));

describe("data health actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthenticatedUser).mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "gm@example.com",
    });
  });

  it("records an authenticated manual player resolution", async () => {
    const formData = new FormData();
    formData.set("reviewId", "22222222-2222-4222-8222-222222222222");
    formData.set("playerId", "33333333-3333-4333-8333-333333333333");

    await expect(resolvePlayerMatchAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard?message=Player%20match%20saved.",
    );
    expect(applyManualPlayerMatch).toHaveBeenCalledWith({
      userId: "11111111-1111-4111-8111-111111111111",
      reviewId: "22222222-2222-4222-8222-222222222222",
      playerId: "33333333-3333-4333-8333-333333333333",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("does not expose internal errors to the dashboard", async () => {
    vi.mocked(applyManualPlayerMatch).mockRejectedValue(
      new Error("database details"),
    );

    await expect(resolvePlayerMatchAction(new FormData())).rejects.toThrow(
      "REDIRECT:/dashboard?error=The%20player%20match%20could%20not%20be%20resolved.%20Try%20again.",
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
