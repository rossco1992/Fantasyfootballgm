import { beforeEach, describe, expect, it, vi } from "vitest";

import { query, withTransaction } from "@/db/client";
import {
  listOpenPlayerMatchReviews,
  listProviderDataHealth,
  resolvePlayerMatchReview,
} from "@/db/repositories/data-health";

vi.mock("@/db/client", () => ({ query: vi.fn(), withTransaction: vi.fn() }));

const providerId = "11111111-1111-4111-8111-111111111111";
const reviewId = "22222222-2222-4222-8222-222222222222";
const playerId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const runId = "55555555-5555-4555-8555-555555555555";
const now = new Date("2026-08-26T12:00:00Z");

describe("data health repository", () => {
  const client = { query: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(withTransaction).mockImplementation(async (operation) =>
      operation(client as never),
    );
  });

  it("reports provider freshness and unresolved identity counts", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          provider_id: providerId,
          provider_slug: "fixture-data",
          provider_name: "Fixture Data",
          last_attempt_at: now,
          last_success_at: now,
          last_status: "succeeded",
          stale_after_seconds: 86400,
          consecutive_failures: 0,
          unresolved_player_count: 2,
        },
      ],
    } as never);

    await expect(listProviderDataHealth()).resolves.toEqual([
      expect.objectContaining({
        providerSlug: "fixture-data",
        unresolvedPlayerCount: 2,
      }),
    ]);
  });

  it("returns safe candidate details for open reviews", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          id: reviewId,
          provider_id: providerId,
          provider_slug: "fixture-data",
          provider_name: "Fixture Data",
          external_player_id: "external-1",
          latest_ingestion_run_id: runId,
          reason: "ambiguous",
          status: "open",
          candidate_player_ids: [playerId],
          evidence: { fullName: "Example Player" },
          occurrences: 2,
          resolved_player_id: null,
          resolved_by_user_id: null,
          first_seen_at: now,
          last_seen_at: now,
          resolved_at: null,
          candidates: [
            {
              id: playerId,
              fullName: "Example Player",
              position: "RB",
              nflTeam: "NYJ",
            },
          ],
        },
      ],
    } as never);

    await expect(listOpenPlayerMatchReviews()).resolves.toEqual([
      expect.objectContaining({
        reason: "ambiguous",
        candidates: [expect.objectContaining({ id: playerId })],
      }),
    ]);
  });

  it("persists a durable manual alias and an audit event atomically", async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [
          {
            provider_id: providerId,
            external_player_id: "external-1",
            latest_ingestion_run_id: runId,
            evidence: { fullName: "Example Player" },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: playerId }] })
      .mockResolvedValue({ rows: [] });

    await resolvePlayerMatchReview({
      reviewId,
      playerId,
      actorUserId: userId,
      resolvedAt: now,
    });

    expect(client.query.mock.calls[2]?.[0]).toContain(
      "on conflict (provider_id, external_id) do update",
    );
    expect(client.query.mock.calls[3]?.[0]).toContain("status = 'resolved'");
    expect(client.query.mock.calls[4]?.[0]).toContain(
      "player_match_audit_events",
    );
    expect(client.query.mock.calls[4]?.[1]).toContain(userId);
  });
});
