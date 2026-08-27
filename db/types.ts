import { z } from "zod";

import {
  FANTASY_DATA_TYPES,
  INGESTION_STATUSES,
  INGESTION_TRIGGERS,
  jsonValueSchema,
  normalizedFantasyDataSchema,
  providerPlayerIdentitySchema,
  sourceProvenanceSchema,
} from "@/domain/fantasy-data";
import { PLAYER_POSITIONS, PLAYER_STATUSES } from "@/domain/player";
import { PLAYER_MATCH_REASONS } from "@/domain/data-health";

/**
 * Row types and validation schemas for the canonical persistence model.
 *
 * These mirror the schema in `supabase/migrations/` and are the typed contract
 * the repositories return. Zod schemas let services validate rows at the
 * persistence boundary (the project standardizes on Zod for validation).
 */

export const SCORING_FORMATS = ["standard", "half_ppr", "ppr"] as const;
export type ScoringFormat = (typeof SCORING_FORMATS)[number];

export const providerSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  created_at: z.date(),
});
export type Provider = z.infer<typeof providerSchema>;

export const playerSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  position: z.enum(PLAYER_POSITIONS),
  nfl_team: z.string().nullable(),
  bye_week: z.number().int().nullable(),
  status: z.enum(PLAYER_STATUSES),
  created_at: z.date(),
  updated_at: z.date(),
});
export type Player = z.infer<typeof playerSchema>;

export const playerExternalIdSchema = z.object({
  id: z.string().uuid(),
  player_id: z.string().uuid(),
  provider_id: z.string().uuid(),
  external_id: z.string(),
  created_at: z.date(),
});
export type PlayerExternalId = z.infer<typeof playerExternalIdSchema>;

export const playerProjectionSchema = z.object({
  id: z.string().uuid(),
  player_id: z.string().uuid(),
  provider_id: z.string().uuid(),
  season: z.number().int(),
  week: z.number().int().nullable(),
  scoring: z.enum(SCORING_FORMATS),
  // pg returns numeric as string to preserve precision; coerce to number here.
  projected_points: z.coerce.number(),
  source_timestamp: z.date(),
  ingested_at: z.date(),
});
export type PlayerProjection = z.infer<typeof playerProjectionSchema>;

export const providerIngestionRunSchema = z.object({
  id: z.string().uuid(),
  provider_id: z.string().uuid(),
  trigger_type: z.enum(INGESTION_TRIGGERS),
  status: z.enum(INGESTION_STATUSES),
  adapter_version: z.string(),
  season: z.number().int(),
  week: z.number().int().nullable(),
  started_at: z.date(),
  completed_at: z.date().nullable(),
  records_received: z.number().int(),
  records_imported: z.number().int(),
  records_rejected: z.number().int(),
  unmatched_player_count: z.number().int(),
  player_identities_received: z.number().int().default(0),
  player_identities_imported: z.number().int().default(0),
  games_received: z.number().int().default(0),
  games_imported: z.number().int().default(0),
  error_details: jsonValueSchema.nullable(),
  created_at: z.date(),
});
export type ProviderIngestionRun = z.infer<typeof providerIngestionRunSchema>;

export const providerDataSnapshotSchema = z.object({
  id: z.string().uuid(),
  provider_id: z.string().uuid(),
  ingestion_run_id: z.string().uuid(),
  source_fingerprint: z.string().length(64),
  adapter_version: z.string(),
  season: z.number().int(),
  week: z.number().int().nullable(),
  observed_at: z.date(),
  imported_at: z.date(),
  provenance: sourceProvenanceSchema,
  created_at: z.date(),
});
export type ProviderDataSnapshot = z.infer<typeof providerDataSnapshotSchema>;

export const providerDataRecordSchema = z.object({
  id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
  player_id: z.string().uuid().nullable(),
  external_player_id: z.string(),
  data_type: z.enum(FANTASY_DATA_TYPES),
  record_key: z.string(),
  normalized_payload: normalizedFantasyDataSchema,
  raw_payload: jsonValueSchema,
  created_at: z.date(),
});
export type ProviderDataRecord = z.infer<typeof providerDataRecordSchema>;

export const providerPlayerIdentityRecordSchema = z.object({
  id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
  player_id: z.string().uuid(),
  external_player_id: z.string(),
  normalized_payload: providerPlayerIdentitySchema,
  raw_payload: jsonValueSchema,
  created_at: z.date(),
});
export type ProviderPlayerIdentityRecord = z.infer<
  typeof providerPlayerIdentityRecordSchema
>;

export const providerGameRecordSchema = z.object({
  id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
  external_game_id: z.string(),
  season: z.number().int(),
  week: z.number().int(),
  season_type: z.enum(["PRE", "REG", "POST"]),
  kickoff_at: z.date().nullable(),
  home_team: z.string(),
  away_team: z.string(),
  home_score: z.number().int().nullable(),
  away_score: z.number().int().nullable(),
  neutral_site: z.boolean(),
  raw_payload: jsonValueSchema,
  created_at: z.date(),
});
export type ProviderGameRecord = z.infer<typeof providerGameRecordSchema>;

export const providerIngestionStateSchema = z.object({
  provider_id: z.string().uuid(),
  last_attempt_at: z.date(),
  last_success_at: z.date().nullable(),
  latest_snapshot_id: z.string().uuid().nullable(),
  last_status: z.enum(INGESTION_STATUSES),
  stale_after_seconds: z.number().int().positive(),
  consecutive_failures: z.number().int().nonnegative(),
  last_error: jsonValueSchema.nullable(),
  updated_at: z.date(),
});
export type ProviderIngestionState = z.infer<
  typeof providerIngestionStateSchema
>;

export const playerMatchReviewRowSchema = z.object({
  id: z.string().uuid(),
  provider_id: z.string().uuid(),
  external_player_id: z.string(),
  latest_ingestion_run_id: z.string().uuid().nullable(),
  reason: z.enum(PLAYER_MATCH_REASONS),
  status: z.enum(["open", "resolved"]),
  candidate_player_ids: z.array(z.string().uuid()),
  evidence: jsonValueSchema,
  occurrences: z.number().int().positive(),
  resolved_player_id: z.string().uuid().nullable(),
  resolved_by_user_id: z.string().uuid().nullable(),
  first_seen_at: z.date(),
  last_seen_at: z.date(),
  resolved_at: z.date().nullable(),
});
export type PlayerMatchReviewRow = z.infer<typeof playerMatchReviewRowSchema>;
