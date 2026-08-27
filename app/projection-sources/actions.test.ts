import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  importProjectionCsvAction,
  refreshProjectionSourcesAction,
} from "@/app/projection-sources/actions";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  importProjectionCsv,
  refreshConfiguredProjectionSources,
} from "@/services/projection-sources";

const { redirect, revalidatePath } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/session", () => ({ requireAuthenticatedUser: vi.fn() }));
vi.mock("@/services/projection-sources", () => ({
  importProjectionCsv: vi.fn(),
  refreshConfiguredProjectionSources: vi.fn(),
}));

const outcome = {
  runId: "11111111-1111-4111-8111-111111111111",
  snapshotId: "22222222-2222-4222-8222-222222222222",
  status: "succeeded" as const,
  duplicate: false,
  recordsReceived: 2,
  recordsImported: 2,
  recordsRejected: 0,
  unmatchedPlayerCount: 1,
  playerIdentitiesReceived: 1,
  playerIdentitiesImported: 1,
  gamesReceived: 0,
  gamesImported: 0,
  coverageGaps: [],
  error: null,
};

describe("projection source actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthenticatedUser).mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      email: "gm@example.com",
    });
  });

  it("refreshes configured APIs for an authenticated user", async () => {
    vi.mocked(refreshConfiguredProjectionSources).mockResolvedValue({
      configured: ["FantasyPros"],
      outcomes: [{ source: "FantasyPros", outcome }],
    });
    const formData = new FormData();
    formData.set("season", "2026");
    formData.set("week", "3");
    formData.set("scoring", "half_ppr");

    await expect(refreshProjectionSourcesAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard?message=1%20projection%20sources%20refreshed%20%C2%B7%200%20failed",
    );
    expect(requireAuthenticatedUser).toHaveBeenCalledOnce();
    expect(refreshConfiguredProjectionSources).toHaveBeenCalledWith({
      season: 2026,
      week: 3,
      scoring: "half_ppr",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("directs the user to CSV when no paid API is configured", async () => {
    vi.mocked(refreshConfiguredProjectionSources).mockResolvedValue({
      configured: [],
      outcomes: [],
    });

    await expect(
      refreshProjectionSourcesAction(new FormData()),
    ).rejects.toThrow(
      "REDIRECT:/dashboard?error=No%20paid%20projection%20API%20is%20configured.%20Upload%20a%20provider%20CSV%20instead.",
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("imports a bounded provider CSV", async () => {
    vi.mocked(importProjectionCsv).mockResolvedValue(outcome);
    const formData = new FormData();
    formData.set("provider", "fantasypros");
    formData.set("season", "2026");
    formData.set("scoring", "ppr");
    formData.set(
      "file",
      new File(["PLAYER NAME,POS,ECR\nExample Runner,RB,4"], "rankings.csv", {
        type: "text/csv",
      }),
    );

    await expect(importProjectionCsvAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard?message=Projection%20CSV%20imported%3A%202%20records%20%C2%B7%201%20unresolved",
    );
    expect(importProjectionCsv).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "fantasypros",
        season: 2026,
        week: null,
        scoring: "ppr",
        fileName: "rankings.csv",
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("rejects a non-CSV upload before ingestion", async () => {
    const formData = new FormData();
    formData.set("file", new File(["not csv"], "rankings.txt"));

    await expect(importProjectionCsvAction(formData)).rejects.toThrow(
      "REDIRECT:/dashboard?error=Projection%20imports%20must%20use%20a%20.csv%20file.",
    );
    expect(importProjectionCsv).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
