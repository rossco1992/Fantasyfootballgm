import { z } from "zod";

import { PLAYER_STATUSES } from "@/domain/player";

export const FANTASY_DATA_TYPES = [
  "projection",
  "ranking",
  "adp",
  "injury",
  "news",
  "historical_performance",
  "usage",
  "market_trend",
] as const;

export const INGESTION_TRIGGERS = ["scheduled", "on_demand"] as const;
export const INGESTION_STATUSES = [
  "running",
  "succeeded",
  "partial",
  "failed",
] as const;

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function isJsonValue(
  value: unknown,
  ancestors = new WeakSet<object>(),
): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;

  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (!isArray && prototype !== Object.prototype && prototype !== null) {
    return false;
  }

  ancestors.add(value);
  const valid = (isArray ? value : Object.values(value)).every((entry) =>
    isJsonValue(entry, ancestors),
  );
  ancestors.delete(value);
  return valid;
}

export const jsonValueSchema = z.custom<JsonValue>(
  isJsonValue,
  "Provider payloads must be JSON-serializable.",
);

const numericMetricsSchema = z.record(
  z.string().trim().min(1),
  z.number().finite(),
);
const optionalPositiveInteger = z.number().int().positive().nullable();

export const normalizedProjectionSchema = z.object({
  type: z.literal("projection"),
  scoring: z.enum(["standard", "half_ppr", "ppr"]).nullable(),
  projectedPoints: z.number().finite().nullable(),
  stats: numericMetricsSchema,
});

export const normalizedRankingSchema = z.object({
  type: z.literal("ranking"),
  rank: z.number().positive(),
  positionRank: optionalPositiveInteger,
  tier: optionalPositiveInteger,
  expertCount: optionalPositiveInteger,
});

export const normalizedAdpSchema = z.object({
  type: z.literal("adp"),
  overall: z.number().positive(),
  position: z.number().positive().nullable(),
  sampleSize: optionalPositiveInteger,
  format: z.string().trim().min(1).max(80).nullable(),
});

export const normalizedInjurySchema = z.object({
  type: z.literal("injury"),
  status: z.enum(PLAYER_STATUSES),
  practiceStatus: z.string().trim().min(1).max(120).nullable(),
  details: z.string().trim().min(1).max(2_000).nullable(),
});

export const normalizedNewsSchema = z.object({
  type: z.literal("news"),
  headline: z.string().trim().min(1).max(500),
  summary: z.string().trim().min(1).max(5_000).nullable(),
  publishedAt: z.string().datetime({ offset: true }),
  url: z.string().url().nullable(),
});

export const normalizedHistoricalPerformanceSchema = z.object({
  type: z.literal("historical_performance"),
  fantasyPoints: z.number().finite().nullable(),
  stats: numericMetricsSchema,
});

export const normalizedUsageSchema = z.object({
  type: z.literal("usage"),
  metrics: numericMetricsSchema,
});

export const normalizedMarketTrendSchema = z.object({
  type: z.literal("market_trend"),
  metrics: numericMetricsSchema,
  direction: z.enum(["rising", "falling", "steady", "unknown"]),
});

export const normalizedFantasyDataSchema = z.discriminatedUnion("type", [
  normalizedProjectionSchema,
  normalizedRankingSchema,
  normalizedAdpSchema,
  normalizedInjurySchema,
  normalizedNewsSchema,
  normalizedHistoricalPerformanceSchema,
  normalizedUsageSchema,
  normalizedMarketTrendSchema,
]);

export const providerDescriptorSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(120),
  adapterVersion: z.string().trim().min(1).max(80),
  staleAfterSeconds: z.number().int().positive(),
});

export const sourceProvenanceSchema = z.object({
  source: z.string().trim().min(1).max(160),
  sourceId: z.string().trim().min(1).max(255).nullable(),
  sourceUrl: z.string().url().nullable(),
  notes: z.array(z.string().trim().min(1).max(500)).max(20),
});

export const providerSnapshotMetadataSchema = z.object({
  season: z.number().int().min(2000).max(2100),
  week: z.number().int().min(1).max(22).nullable(),
  observedAt: z.string().datetime({ offset: true }),
  provenance: sourceProvenanceSchema,
});

export const providerRecordCandidateSchema = z.object({
  recordKey: z.string().trim().min(1).max(255),
  externalPlayerId: z.string().trim().min(1).max(255),
  normalized: normalizedFantasyDataSchema,
  raw: jsonValueSchema,
});

export const providerIngestionRequestSchema = z.object({
  trigger: z.enum(INGESTION_TRIGGERS),
  season: z.number().int().min(2000).max(2100),
  week: z.number().int().min(1).max(22).nullable(),
});

export type FantasyDataType = (typeof FANTASY_DATA_TYPES)[number];
export type IngestionTrigger = (typeof INGESTION_TRIGGERS)[number];
export type IngestionStatus = (typeof INGESTION_STATUSES)[number];
export type NormalizedFantasyData = z.infer<typeof normalizedFantasyDataSchema>;
export type ProviderDescriptor = z.infer<typeof providerDescriptorSchema>;
export type SourceProvenance = z.infer<typeof sourceProvenanceSchema>;
export type ProviderSnapshotMetadata = z.infer<
  typeof providerSnapshotMetadataSchema
>;
export type ProviderRecord = z.infer<typeof providerRecordCandidateSchema>;
export type ProviderIngestionRequest = z.infer<
  typeof providerIngestionRequestSchema
>;

export type ProviderRecordCandidate = {
  recordKey: unknown;
  externalPlayerId: unknown;
  normalized: unknown;
  raw: unknown;
};

export type ProviderSnapshotCandidate = {
  season: unknown;
  week: unknown;
  observedAt: unknown;
  provenance: unknown;
  records: unknown;
};

export type RejectedProviderRecord = {
  recordIndex: number;
  rawPayload: JsonValue;
  validationErrors: JsonValue;
};
