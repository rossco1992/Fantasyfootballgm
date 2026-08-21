import { describe, expect, it } from "vitest";

import {
  FANTASY_DATA_TYPES,
  jsonValueSchema,
  normalizedFantasyDataSchema,
  providerGameCandidateSchema,
  providerPlayerIdentityCandidateSchema,
  providerRecordCandidateSchema,
} from "@/domain/fantasy-data";

describe("normalized fantasy-data contracts", () => {
  const records = [
    {
      type: "projection",
      scoring: "ppr",
      projectedPoints: 18.5,
      stats: { receptions: 5 },
    },
    {
      type: "ranking",
      rank: 12,
      positionRank: 5,
      tier: 2,
      expertCount: 30,
    },
    {
      type: "adp",
      overall: 14.2,
      position: 6,
      sampleSize: 900,
      format: "ppr",
    },
    {
      type: "injury",
      status: "questionable",
      practiceStatus: "limited",
      details: null,
    },
    {
      type: "news",
      headline: "Player returned to practice",
      summary: null,
      publishedAt: "2026-08-20T12:00:00.000Z",
      url: "https://example.test/news/1",
    },
    {
      type: "historical_performance",
      fantasyPoints: 17.3,
      stats: { targets: 8 },
    },
    { type: "usage", metrics: { snapShare: 0.78 } },
    {
      type: "market_trend",
      metrics: { rosterAdds: 300 },
      direction: "rising",
    },
  ];

  it("defines a validated normalized payload for every supported signal", () => {
    const parsedTypes = records.map(
      (record) => normalizedFantasyDataSchema.parse(record).type,
    );
    expect(new Set(parsedTypes)).toEqual(new Set(FANTASY_DATA_TYPES));
  });

  it("keeps raw provider values beside normalized data", () => {
    const record = providerRecordCandidateSchema.parse({
      recordKey: "player-1:projection",
      externalPlayerId: "player-1",
      normalized: records[0],
      raw: { projected_points: "18.5", provider_field: true },
    });

    expect(record.normalized.type).toBe("projection");
    expect(record.raw).toEqual({
      projected_points: "18.5",
      provider_field: true,
    });
  });

  it("rejects non-JSON raw values and invalid normalized values", () => {
    expect(jsonValueSchema.safeParse({ value: Number.NaN }).success).toBe(
      false,
    );
    expect(jsonValueSchema.safeParse({ value: new Date() }).success).toBe(
      false,
    );
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(jsonValueSchema.safeParse(cyclic).success).toBe(false);
    expect(
      normalizedFantasyDataSchema.safeParse({
        type: "ranking",
        rank: 0,
        positionRank: null,
        tier: null,
        expertCount: null,
      }).success,
    ).toBe(false);
  });

  it("validates provider-backed player aliases and schedule games", () => {
    expect(
      providerPlayerIdentityCandidateSchema.parse({
        externalPlayerId: "00-0033280",
        fullName: "Christian McCaffrey",
        position: "RB",
        nflTeam: "SF",
        byeWeek: 14,
        status: "active",
        aliases: [
          {
            providerSlug: "sleeper",
            providerName: "Sleeper",
            externalId: "4034",
          },
        ],
        raw: { gsis_id: "00-0033280" },
      }),
    ).toMatchObject({ aliases: [{ providerSlug: "sleeper" }] });
    expect(
      providerGameCandidateSchema.parse({
        externalGameId: "2026_01_SF_SEA",
        season: 2026,
        week: 1,
        seasonType: "REG",
        kickoffAt: "2026-09-13T20:25:00.000Z",
        homeTeam: "SEA",
        awayTeam: "SF",
        homeScore: null,
        awayScore: null,
        neutralSite: false,
        raw: { game_id: "2026_01_SF_SEA" },
      }),
    ).toMatchObject({ homeTeam: "SEA", awayTeam: "SF" });
  });
});
