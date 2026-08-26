import { describe, expect, it, vi } from "vitest";

import { withTransaction } from "@/db/client";
import { withProviderRefreshLock } from "@/db/repositories/provider-refresh-lock";

vi.mock("@/db/client", () => ({ withTransaction: vi.fn() }));

describe("provider refresh lock", () => {
  it("takes a provider-scoped advisory lock before running the operation", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(withTransaction).mockImplementation(async (operation) =>
      operation({ query } as never),
    );
    const operation = vi.fn().mockResolvedValue("done");

    await expect(
      withProviderRefreshLock("sleeper-player-catalog", operation),
    ).resolves.toBe("done");
    expect(query).toHaveBeenCalledWith(
      "select pg_advisory_xact_lock(hashtext($1))",
      ["sleeper-player-catalog"],
    );
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(
      operation.mock.invocationCallOrder[0]!,
    );
  });
});
