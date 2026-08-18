import { z } from "zod";

/**
 * Row types and validation schemas for the canonical persistence model.
 *
 * These mirror the schema in `supabase/migrations/` and are the typed contract
 * the repositories return. Zod schemas let services validate rows at the
 * persistence boundary (the project standardizes on Zod for validation).
 */

export const PLAYER_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DST"] as const;
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];

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
