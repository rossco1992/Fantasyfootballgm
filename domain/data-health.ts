import { z } from "zod";

import { INGESTION_STATUSES, jsonValueSchema } from "@/domain/fantasy-data";
import { PLAYER_POSITIONS } from "@/domain/player";

export const PLAYER_MATCH_REASONS = [
  "unmatched",
  "ambiguous",
  "conflicting_external_ids",
] as const;

export const playerMatchCandidateSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  position: z.enum(PLAYER_POSITIONS),
  nflTeam: z.string().nullable(),
});

export const playerMatchReviewSchema = z.object({
  id: z.string().uuid(),
  providerId: z.string().uuid(),
  providerSlug: z.string(),
  providerName: z.string(),
  externalPlayerId: z.string(),
  reason: z.enum(PLAYER_MATCH_REASONS),
  evidence: jsonValueSchema,
  occurrences: z.number().int().positive(),
  firstSeenAt: z.date(),
  lastSeenAt: z.date(),
  candidates: z.array(playerMatchCandidateSchema),
});

export const providerDataHealthSchema = z.object({
  providerId: z.string().uuid(),
  providerSlug: z.string(),
  providerName: z.string(),
  lastAttemptAt: z.date().nullable(),
  lastSuccessAt: z.date().nullable(),
  lastStatus: z.enum(INGESTION_STATUSES).nullable(),
  staleAfterSeconds: z.number().int().positive().nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  unresolvedPlayerCount: z.number().int().nonnegative(),
});

export type PlayerMatchCandidate = z.infer<typeof playerMatchCandidateSchema>;
export type PlayerMatchReview = z.infer<typeof playerMatchReviewSchema>;
export type ProviderDataHealth = z.infer<typeof providerDataHealthSchema>;
