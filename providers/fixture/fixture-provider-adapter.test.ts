import { describe, expect, it } from "vitest";

import { FANTASY_DATA_TYPES } from "@/domain/fantasy-data";
import { FixtureProviderAdapter } from "@/providers/fixture/fixture-provider-adapter";
import { describeProviderAdapterContract } from "@/tests/contracts/provider-adapter.contract";

const request = { trigger: "on_demand" as const, season: 2026, week: 1 };

describeProviderAdapterContract({
  name: "fixture fantasy data",
  createAdapter: () => new FixtureProviderAdapter(),
  request,
});

describe("fixture provider adapter", () => {
  it("exercises every normalized signal type", async () => {
    const adapter = new FixtureProviderAdapter();
    const snapshot = adapter.normalize(await adapter.fetch(request), request);
    const types = (snapshot.records as { normalized: { type: string } }[]).map(
      (record) => record.normalized.type,
    );

    expect(new Set(types)).toEqual(new Set(FANTASY_DATA_TYPES));
  });
});
