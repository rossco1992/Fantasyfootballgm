import { z } from "zod";

import fixture from "@/providers/fixtures/fantasy-data.json";
import type {
  JsonValue,
  ProviderDescriptor,
  ProviderIngestionRequest,
  ProviderRecordCandidate,
  ProviderSnapshotCandidate,
} from "@/domain/fantasy-data";
import type { FantasyDataProviderAdapter } from "@/providers/types";

const metricsSchema = z.record(z.string(), z.number());
const fixturePlayerSchema = z.object({
  externalId: z.string(),
  projection: z.object({
    scoring: z.enum(["standard", "half_ppr", "ppr"]).nullable(),
    projectedPoints: z.number().nullable(),
    stats: metricsSchema,
  }),
  ranking: z.object({
    rank: z.number(),
    positionRank: z.number().nullable(),
    tier: z.number().nullable(),
    expertCount: z.number().nullable(),
  }),
  adp: z.object({
    overall: z.number(),
    position: z.number().nullable(),
    sampleSize: z.number().nullable(),
    format: z.string().nullable(),
  }),
  injury: z.object({
    status: z.string(),
    practiceStatus: z.string().nullable(),
    details: z.string().nullable(),
  }),
  news: z.array(
    z.object({
      id: z.string(),
      headline: z.string(),
      summary: z.string().nullable(),
      publishedAt: z.string(),
      url: z.string().nullable(),
    }),
  ),
  historicalPerformance: z.object({
    fantasyPoints: z.number().nullable(),
    stats: metricsSchema,
  }),
  usage: z.object({ metrics: metricsSchema }),
  marketTrend: z.object({
    metrics: metricsSchema,
    direction: z.enum(["rising", "falling", "steady", "unknown"]),
  }),
});

const fixturePayloadSchema = z.object({
  season: z.number(),
  week: z.number().nullable(),
  observedAt: z.string(),
  sourceId: z.string(),
  sourceUrl: z.string(),
  players: z.array(fixturePlayerSchema),
});

export type FixtureProviderPayload = z.infer<typeof fixturePayloadSchema>;

export const FIXTURE_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  slug: "fixture-data",
  name: "Fixture Fantasy Data",
  adapterVersion: "1.0.0",
  staleAfterSeconds: 86_400,
};

function candidate(
  externalPlayerId: string,
  recordKey: string,
  raw: JsonValue,
  normalized: ProviderRecordCandidate["normalized"],
): ProviderRecordCandidate {
  return { externalPlayerId, recordKey, raw, normalized };
}

export class FixtureProviderAdapter implements FantasyDataProviderAdapter<FixtureProviderPayload> {
  readonly descriptor = FIXTURE_PROVIDER_DESCRIPTOR;

  constructor(
    private readonly payload: FixtureProviderPayload = fixturePayloadSchema.parse(
      fixture,
    ),
  ) {}

  async fetch(
    request: ProviderIngestionRequest,
  ): Promise<FixtureProviderPayload> {
    void request;
    return structuredClone(this.payload);
  }

  normalize(
    payloadInput: FixtureProviderPayload,
    request: ProviderIngestionRequest,
  ): ProviderSnapshotCandidate {
    void request;
    const payload = fixturePayloadSchema.parse(payloadInput);
    const records: ProviderRecordCandidate[] = [];

    for (const player of payload.players) {
      records.push(
        candidate(
          player.externalId,
          `${player.externalId}:projection`,
          player.projection,
          { type: "projection", ...player.projection },
        ),
        candidate(
          player.externalId,
          `${player.externalId}:ranking`,
          player.ranking,
          { type: "ranking", ...player.ranking },
        ),
        candidate(player.externalId, `${player.externalId}:adp`, player.adp, {
          type: "adp",
          ...player.adp,
        }),
        candidate(
          player.externalId,
          `${player.externalId}:injury`,
          player.injury,
          { type: "injury", ...player.injury },
        ),
        candidate(
          player.externalId,
          `${player.externalId}:historical-performance`,
          player.historicalPerformance,
          {
            type: "historical_performance",
            ...player.historicalPerformance,
          },
        ),
        candidate(
          player.externalId,
          `${player.externalId}:usage`,
          player.usage,
          { type: "usage", ...player.usage },
        ),
        candidate(
          player.externalId,
          `${player.externalId}:market-trend`,
          player.marketTrend,
          { type: "market_trend", ...player.marketTrend },
        ),
      );

      for (const article of player.news) {
        records.push(
          candidate(
            player.externalId,
            `${player.externalId}:news:${article.id}`,
            article,
            {
              type: "news",
              headline: article.headline,
              summary: article.summary,
              publishedAt: article.publishedAt,
              url: article.url,
            },
          ),
        );
      }
    }

    return {
      season: payload.season,
      week: payload.week,
      observedAt: payload.observedAt,
      provenance: {
        source: this.descriptor.name,
        sourceId: payload.sourceId,
        sourceUrl: payload.sourceUrl,
        notes: ["Static fixture used for provider contract verification."],
      },
      records,
    };
  }
}

export const fixtureProviderAdapter = new FixtureProviderAdapter();
