import { describe, expect, it } from "vitest";

import {
  providerPlayerIdentityCandidateSchema,
  providerRecordCandidateSchema,
} from "@/domain/fantasy-data";
import { ManualProjectionCsvAdapter } from "@/providers/manual/manual-projection-csv-adapter";
import { describeProviderAdapterContract } from "@/tests/contracts/provider-adapter.contract";

const csv = `RK,PLAYER NAME,TEAM,POS,BYE WEEK,ECR,ADP,PROJECTED POINTS,RUSHING YARDS,INJURY STATUS,SLEEPER ID
1,Example Runner,SF,RB,9,4,6.5,287.4,"1,080",Q,sleeper-1`;
const request = { trigger: "on_demand" as const, season: 2026, week: null };

function adapter() {
  return new ManualProjectionCsvAdapter(
    "fantasypros",
    csv,
    "fantasypros-2026.csv",
    "2026-08-27T12:00:00.000Z",
    "ppr",
  );
}

describeProviderAdapterContract({
  name: "manual projection CSV",
  createAdapter: adapter,
  request,
});

describe("manual projection CSV adapter", () => {
  it("normalizes common export headings without requiring a provider ID", async () => {
    const instance = adapter();
    const snapshot = instance.normalize(await instance.fetch(), request);
    const players = (snapshot.players as unknown[]).map((entry) =>
      providerPlayerIdentityCandidateSchema.parse(entry),
    );
    const records = (snapshot.records as unknown[]).map((entry) =>
      providerRecordCandidateSchema.parse(entry),
    );

    expect(players[0]).toMatchObject({
      externalPlayerId: "csv:example-runner:rb",
      fullName: "Example Runner",
      aliases: [{ providerSlug: "sleeper", externalId: "sleeper-1" }],
    });
    expect(records.map((record) => record.normalized.type)).toEqual([
      "ranking",
      "adp",
      "projection",
      "injury",
    ]);
    expect(records[2]?.normalized).toMatchObject({
      type: "projection",
      projectedPoints: 287.4,
      stats: { rushing_yards: 1080 },
    });
  });
});
