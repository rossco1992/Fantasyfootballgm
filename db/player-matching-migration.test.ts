import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readMigrationFiles } from "@/db/migrate";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

describe("player matching upgrade migration", () => {
  const db = new PGlite();

  beforeAll(async () => {
    for (const file of readMigrationFiles().filter((file) => file < "0007")) {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    }
    await db.exec(`
      insert into providers (id, slug, name)
      values ('11111111-1111-4111-8111-111111111111', 'legacy-source', 'Legacy Source');
      insert into provider_ingestion_runs (
        id, provider_id, trigger_type, status, adapter_version, season, week,
        started_at
      ) values (
        '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111', 'on_demand', 'running',
        '1.0.0', 2025, 1, '2026-08-26T12:00:00Z'
      );
      insert into provider_data_snapshots (
        id, provider_id, ingestion_run_id, source_fingerprint,
        adapter_version, season, week, observed_at, imported_at, provenance
      ) values (
        '33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '${"a".repeat(64)}', '1.0.0', 2025, 1,
        '2026-08-26T12:00:00Z', '2026-08-26T12:01:00Z',
        '{"source":"Legacy Source","sourceId":"legacy","sourceUrl":null,"notes":[]}'::jsonb
      );
      insert into provider_data_records (
        snapshot_id, player_id, external_player_id, data_type, record_key,
        normalized_payload, raw_payload
      ) values (
        '33333333-3333-4333-8333-333333333333', null, 'legacy-player',
        'usage', 'legacy-player:usage:2025:1',
        '{"type":"usage","metrics":{"targets":4}}'::jsonb,
        '{"player_id":"legacy-player"}'::jsonb
      );
      update provider_ingestion_runs
         set status = 'partial', completed_at = '2026-08-26T12:01:00Z'
       where id = '22222222-2222-4222-8222-222222222222';
    `);
    await db.exec(
      readFileSync(
        join(MIGRATIONS_DIR, "0007_player_matching_and_data_health.sql"),
        "utf8",
      ),
    );
  });

  afterAll(async () => db.close());

  it("queues and audits unmatched records that predate the review tables", async () => {
    const reviews = await db.query<{
      external_player_id: string;
      reason: string;
      occurrences: number;
    }>(
      `select external_player_id, reason, occurrences
         from player_match_reviews`,
    );
    expect(reviews.rows).toEqual([
      {
        external_player_id: "legacy-player",
        reason: "unmatched",
        occurrences: 1,
      },
    ]);
    const audit = await db.query<{ event_type: string; strategy: string }>(
      `select event_type, strategy from player_match_audit_events`,
    );
    expect(audit.rows).toEqual([{ event_type: "queued", strategy: "none" }]);
  });
});
