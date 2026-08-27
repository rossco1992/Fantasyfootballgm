import { z } from "zod";

import { query, withTransaction } from "@/db/client";
import type { PlayerMatchReviewRow } from "@/db/types";
import {
  type PlayerMatchReview,
  type ProviderDataHealth,
  playerMatchReviewSchema,
  providerDataHealthSchema,
} from "@/domain/data-health";
import { jsonValueSchema } from "@/domain/fantasy-data";

type ProviderDataHealthRow = {
  provider_id: string;
  provider_slug: string;
  provider_name: string;
  last_attempt_at: Date | null;
  last_success_at: Date | null;
  last_status: "running" | "succeeded" | "partial" | "failed" | null;
  stale_after_seconds: number | null;
  consecutive_failures: number;
  unresolved_player_count: number;
};

type PlayerMatchReviewListRow = PlayerMatchReviewRow & {
  provider_slug: string;
  provider_name: string;
  candidates: unknown;
};

export class PlayerMatchResolutionError extends Error {}

export async function listProviderDataHealth(): Promise<ProviderDataHealth[]> {
  const result = await query<ProviderDataHealthRow>(
    `select p.id as provider_id, p.slug as provider_slug,
            p.name as provider_name, state.last_attempt_at,
            state.last_success_at, state.last_status,
            state.stale_after_seconds,
            coalesce(state.consecutive_failures, 0)::int as consecutive_failures,
            count(review.id)::int as unresolved_player_count
       from providers p
       left join provider_ingestion_state state on state.provider_id = p.id
       left join player_match_reviews review
         on review.provider_id = p.id and review.status = 'open'
      group by p.id, p.slug, p.name, state.last_attempt_at,
               state.last_success_at, state.last_status,
               state.stale_after_seconds, state.consecutive_failures
      order by p.name`,
  );

  return result.rows.map((row) =>
    providerDataHealthSchema.parse({
      providerId: row.provider_id,
      providerSlug: row.provider_slug,
      providerName: row.provider_name,
      lastAttemptAt: row.last_attempt_at,
      lastSuccessAt: row.last_success_at,
      lastStatus: row.last_status,
      staleAfterSeconds: row.stale_after_seconds,
      consecutiveFailures: row.consecutive_failures,
      unresolvedPlayerCount: row.unresolved_player_count,
    }),
  );
}

export async function listOpenPlayerMatchReviews(
  limit = 20,
): Promise<PlayerMatchReview[]> {
  const parsedLimit = z.number().int().min(1).max(100).parse(limit);
  const result = await query<PlayerMatchReviewListRow>(
    `select review.*, provider.slug as provider_slug,
            provider.name as provider_name,
            coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', candidate.id,
                'fullName', candidate.full_name,
                'position', candidate.position,
                'nflTeam', candidate.nfl_team
              ) order by candidate.full_name)
                from unnest(review.candidate_player_ids) candidate_id
                join players candidate on candidate.id = candidate_id
            ), '[]'::jsonb) as candidates
       from player_match_reviews review
       join providers provider on provider.id = review.provider_id
      where review.status = 'open'
      order by review.last_seen_at desc, review.id
      limit $1`,
    [parsedLimit],
  );

  return result.rows.map((row) =>
    playerMatchReviewSchema.parse({
      id: row.id,
      providerId: row.provider_id,
      providerSlug: row.provider_slug,
      providerName: row.provider_name,
      externalPlayerId: row.external_player_id,
      reason: row.reason,
      evidence: row.evidence,
      occurrences: row.occurrences,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      candidates: row.candidates,
    }),
  );
}

export async function resolvePlayerMatchReview(input: {
  reviewId: string;
  playerId: string;
  actorUserId: string;
  resolvedAt: Date;
}): Promise<void> {
  const parsed = z
    .object({
      reviewId: z.string().uuid(),
      playerId: z.string().uuid(),
      actorUserId: z.string().uuid(),
      resolvedAt: z.date(),
    })
    .parse(input);

  await withTransaction(async (client) => {
    const reviewResult = await client.query<{
      provider_id: string;
      external_player_id: string;
      latest_ingestion_run_id: string | null;
      evidence: unknown;
    }>(
      `select provider_id, external_player_id, latest_ingestion_run_id,
              evidence
         from player_match_reviews
        where id = $1 and status = 'open'
        for update`,
      [parsed.reviewId],
    );
    const review = reviewResult.rows[0];
    if (!review) {
      throw new PlayerMatchResolutionError(
        "This player match was already resolved or no longer exists.",
      );
    }

    const playerResult = await client.query<{ id: string }>(
      `select id from players where id = $1`,
      [parsed.playerId],
    );
    if (!playerResult.rows[0]) {
      throw new PlayerMatchResolutionError(
        "The selected canonical player does not exist.",
      );
    }

    await client.query(
      `insert into player_external_ids (player_id, provider_id, external_id)
       values ($1, $2, $3)
       on conflict (provider_id, external_id) do update
         set player_id = excluded.player_id`,
      [parsed.playerId, review.provider_id, review.external_player_id],
    );
    await client.query(
      `update player_match_reviews
          set status = 'resolved', resolved_player_id = $2,
              resolved_by_user_id = $3, resolved_at = $4,
              last_seen_at = $4
        where id = $1`,
      [parsed.reviewId, parsed.playerId, parsed.actorUserId, parsed.resolvedAt],
    );
    await client.query(
      `insert into player_match_audit_events
        (provider_id, external_player_id, ingestion_run_id, player_id,
         event_type, strategy, evidence, actor_user_id, created_at)
       values ($1, $2, $3, $4, 'manual_override', 'manual_override',
         $5::jsonb, $6, $7)`,
      [
        review.provider_id,
        review.external_player_id,
        review.latest_ingestion_run_id,
        parsed.playerId,
        JSON.stringify(jsonValueSchema.parse(review.evidence)),
        parsed.actorUserId,
        parsed.resolvedAt,
      ],
    );
  });
}
