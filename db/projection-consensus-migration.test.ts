import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readMigrationFiles } from "@/db/migrate";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const LEAGUE_ID = "11111111-1111-4111-8111-111111111111";
const PLAYER_ID = "22222222-2222-4222-8222-222222222222";
const SNAPSHOT_ID = "33333333-3333-4333-8333-333333333333";

describe("projection consensus migration", () => {
  const db = new PGlite();

  beforeAll(async () => {
    for (const file of readMigrationFiles()) {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    }
    await db.exec(`
      insert into league_configurations (
        id, user_id, name, team_count, league_format, max_keepers_per_team,
        draft_type, draft_position, scoring_preset, qb_slots, rb_slots,
        wr_slots, te_slots, flex_slots, superflex_slots, k_slots, dst_slots,
        bench_slots
      ) values (
        '${LEAGUE_ID}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Test', 12,
        'redraft', 0, 'snake', 1, 'ppr', 1, 2, 2, 1, 1, 0, 1, 1, 6
      );
      insert into players (id, full_name, position, nfl_team)
      values ('${PLAYER_ID}', 'Test Player', 'WR', 'NYJ');
      insert into projection_consensus_snapshots (
        id, league_configuration_id, season, week, horizon, scoring,
        weighting_version, calculation_version, weighting_config,
        source_snapshot_ids, input_fingerprint, generated_at
      ) values (
        '${SNAPSHOT_ID}', '${LEAGUE_ID}', 2026, null, 'preseason', 'ppr',
        'weights-v1', 'calculation-v1',
        '{"version":"weights-v1","providers":{}}'::jsonb, '{}',
        '${"a".repeat(64)}', '2026-08-29T12:00:00Z'
      );
      insert into projection_consensus_entries (
        consensus_snapshot_id, player_id, position, consensus_points,
        low_points, high_points, range_points, standard_deviation, confidence,
        source_count, group_count, components
      ) values (
        '${SNAPSHOT_ID}', '${PLAYER_ID}', 'WR', 250, 240, 260, 20, 5, .8,
        2, 1, '[]'::jsonb
      );
    `);
  });

  afterAll(async () => db.close());

  it("stores uncertainty separately from immutable provider projections", async () => {
    const result = await db.query<{
      consensus_points: string;
      range_points: string;
      confidence: string;
    }>(
      `select consensus_points, range_points, confidence
         from projection_consensus_entries
        where consensus_snapshot_id = $1`,
      [SNAPSHOT_ID],
    );

    expect(result.rows[0]).toMatchObject({
      consensus_points: "250.0000",
      range_points: "20.0000",
      confidence: "0.8000",
    });
  });

  it("prevents prior consensus evidence from being rewritten", async () => {
    await expect(
      db.exec(
        `update projection_consensus_snapshots
            set weighting_version = 'rewritten'
          where id = '${SNAPSHOT_ID}'`,
      ),
    ).rejects.toThrow(/append-only/);
  });
});
