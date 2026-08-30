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
      stats: { rushingYards: 1080 },
    });
  });

  it("rejects a CSV with no recognized player records", async () => {
    const instance = new ManualProjectionCsvAdapter(
      "fantasypros",
      "UNKNOWN COLUMN\nvalue",
      "empty.csv",
      "2026-08-27T12:00:00.000Z",
      "ppr",
    );

    expect(() =>
      instance.normalize(
        {
          csv: "UNKNOWN COLUMN\nvalue",
          fileName: "empty.csv",
          observedAt: "2026-08-27T12:00:00.000Z",
        },
        request,
      ),
    ).toThrow("Projection CSV contained no recognized player records.");
  });

  it("accepts a player-list CSV without rankings or projections", async () => {
    const instance = new ManualProjectionCsvAdapter(
      "fantasypros",
      "PLAYER NAME,POS,TEAM\nExample Runner,RB,SF\nExample Passer,QB,BUF",
      "all-players.csv",
      "2026-08-27T12:00:00.000Z",
      "ppr",
    );

    const snapshot = instance.normalize(await instance.fetch(), request);

    expect(snapshot.players).toHaveLength(2);
    expect(snapshot.records).toEqual([]);
  });

  it("normalizes Yahoo player-list rank and average-pick headings", async () => {
    const instance = new ManualProjectionCsvAdapter(
      "yahoo",
      "Yahoo ID,Player,Team,Pos,Bye,O-Rank,Average Pick\n123,Example Runner,SF,RB,9,7,11.4",
      "yahoo-players.csv",
      "2026-08-30T12:00:00.000Z",
      "half_ppr",
    );

    const snapshot = instance.normalize(await instance.fetch(), request);
    const players = (snapshot.players as unknown[]).map((entry) =>
      providerPlayerIdentityCandidateSchema.parse(entry),
    );
    const records = (snapshot.records as unknown[]).map((entry) =>
      providerRecordCandidateSchema.parse(entry),
    );

    expect(instance.descriptor).toMatchObject({
      slug: expect.stringMatching(/^yahoo-csv-[a-f0-9]{12}$/),
      name: expect.stringContaining("Yahoo CSV"),
    });
    expect(players[0]).toMatchObject({
      externalPlayerId: "123",
      fullName: "Example Runner",
      position: "RB",
    });
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          normalized: expect.objectContaining({ type: "ranking", rank: 7 }),
        }),
        expect.objectContaining({
          normalized: expect.objectContaining({ type: "adp", overall: 11.4 }),
        }),
      ]),
    );
  });
});
