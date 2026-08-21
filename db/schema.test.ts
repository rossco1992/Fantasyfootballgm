import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readMigrationFiles } from "@/db/migrate";
import { LATEST_PLAYER_DATA_SQL } from "@/db/repositories/provider-ingestion";

/**
 * Verifies the Definition of Done using an in-process Postgres (PGlite): a
 * fresh database can be created from the migration files, and the seed produces
 * usable development data. This runs the exact `supabase/migrations/*.sql` and
 * `supabase/seed.sql` files — no Docker or external database required.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SEED_FILE = join(process.cwd(), "supabase", "seed.sql");

async function count(db: PGlite, table: string): Promise<number> {
  const result = await db.query<{ n: number }>(
    `select count(*)::int as n from ${table}`,
  );
  return result.rows[0]!.n;
}

describe("database schema and seed", () => {
  const db = new PGlite();

  beforeAll(async () => {
    // Fresh database created purely from migration files.
    for (const file of readMigrationFiles()) {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    }
    await db.exec(readFileSync(SEED_FILE, "utf8"));
  });

  afterAll(async () => {
    await db.close();
  });

  it("creates the canonical tables from migrations", async () => {
    const result = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' order by table_name`,
    );
    const tables = result.rows.map((row) => row.table_name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "players",
        "providers",
        "player_external_ids",
        "player_projections",
        "league_configurations",
        "provider_ingestion_runs",
        "provider_data_snapshots",
        "provider_data_records",
        "provider_player_identity_records",
        "provider_game_records",
        "provider_ingestion_rejections",
        "provider_ingestion_state",
      ]),
    );
  });

  it("persists and edits one validated league configuration per user", async () => {
    const userId = "33333333-3333-4333-8333-333333333333";
    await db.query(
      `insert into league_configurations (
        user_id, name, team_count, league_format, max_keepers_per_team,
        draft_type, draft_position, scoring_preset, qb_slots, rb_slots,
        wr_slots, te_slots, flex_slots, superflex_slots, k_slots, dst_slots,
        bench_slots
      ) values ($1, 'Original League', 12, 'redraft', 0, 'snake', 3, 'ppr', 1, 2, 2, 1, 1, 0, 1, 1, 6)
      on conflict (user_id) do update set name = excluded.name`,
      [userId],
    );
    await db.query(
      `insert into league_configurations (
        user_id, name, team_count, league_format, max_keepers_per_team,
        draft_type, draft_position, scoring_preset, qb_slots, rb_slots,
        wr_slots, te_slots, flex_slots, superflex_slots, k_slots, dst_slots,
        bench_slots
      ) values ($1, 'Edited League', 12, 'keeper', 3, 'snake', 3, 'half_ppr', 1, 2, 2, 1, 1, 0, 1, 1, 6)
      on conflict (user_id) do update set
        name = excluded.name, league_format = excluded.league_format,
        max_keepers_per_team = excluded.max_keepers_per_team,
        scoring_preset = excluded.scoring_preset`,
      [userId],
    );

    const result = await db.query<{
      name: string;
      league_format: string;
      max_keepers_per_team: number;
      scoring_preset: string;
    }>(
      `select name, league_format, max_keepers_per_team, scoring_preset
         from league_configurations where user_id = $1`,
      [userId],
    );
    expect(result.rows).toEqual([
      {
        name: "Edited League",
        league_format: "keeper",
        max_keepers_per_team: 3,
        scoring_preset: "half_ppr",
      },
    ]);
  });

  it("rejects invalid league configurations at the database boundary", async () => {
    await expect(
      db.exec(`insert into league_configurations (
        user_id, name, team_count, league_format, max_keepers_per_team,
        draft_type, draft_position, scoring_preset, qb_slots, rb_slots,
        wr_slots, te_slots, flex_slots, superflex_slots, k_slots, dst_slots,
        bench_slots
      ) values (
        '44444444-4444-4444-8444-444444444444', 'Invalid League', 10,
        'redraft', 0, 'snake', 11, 'ppr', 1, 2, 2, 1, 1, 0, 1, 1, 6
      )`),
    ).rejects.toThrow();

    await expect(
      db.exec(`insert into league_configurations (
        user_id, name, team_count, league_format, max_keepers_per_team,
        draft_type, draft_position, scoring_preset, qb_slots, rb_slots,
        wr_slots, te_slots, flex_slots, superflex_slots, k_slots, dst_slots,
        bench_slots
      ) values (
        '55555555-5555-4555-8555-555555555555', 'No Starters', 10,
        'redraft', 0, 'linear', 1, 'standard', 0, 0, 0, 0, 0, 0, 0, 0, 6
      )`),
    ).rejects.toThrow();

    await expect(
      db.exec(`insert into league_configurations (
        user_id, name, team_count, league_format, max_keepers_per_team,
        draft_type, draft_position, scoring_preset, qb_slots, rb_slots,
        wr_slots, te_slots, flex_slots, superflex_slots, k_slots, dst_slots,
        bench_slots
      ) values (
        '66666666-6666-4666-8666-666666666666', 'Invalid Keeper League', 10,
        'keeper', 0, 'snake', 1, 'ppr', 1, 2, 2, 1, 1, 0, 1, 1, 6
      )`),
    ).rejects.toThrow();
  });

  it("seeds usable development data", async () => {
    expect(await count(db, "providers")).toBe(3);
    expect(await count(db, "players")).toBe(4);
    expect(await count(db, "player_external_ids")).toBe(7);
    expect(await count(db, "player_projections")).toBe(5);
  });

  it("stores immutable raw and normalized provider snapshots idempotently", async () => {
    const runId = "eeeeeeee-0000-4000-8000-000000000001";
    const snapshotId = "eeeeeeee-0000-4000-8000-000000000002";
    const replayRunId = "eeeeeeee-0000-4000-8000-000000000003";
    const fingerprint = "a".repeat(64);

    await db.query(
      `insert into provider_ingestion_runs
        (id, provider_id, trigger_type, status, adapter_version, season, week,
         started_at, completed_at, records_received, records_imported)
       values ($1, '33333333-3333-4333-8333-333333333333', 'on_demand',
         'running', '1.0.0', 2026, 1, '2026-08-20T12:01:00Z',
         null, 1, 1)`,
      [runId],
    );
    await db.query(
      `insert into provider_data_snapshots
        (id, provider_id, ingestion_run_id, source_fingerprint,
         adapter_version, season, week, observed_at, imported_at, provenance)
       values ($1, '33333333-3333-4333-8333-333333333333', $2, $3,
         '1.0.0', 2026, 1, '2026-08-20T12:00:00Z',
         '2026-08-20T12:01:01Z',
         '{"source":"Fixture Fantasy Data","sourceId":"fixture-1","sourceUrl":null,"notes":[]}'::jsonb)`,
      [snapshotId, runId, fingerprint],
    );
    await db.query(
      `insert into provider_data_records
        (snapshot_id, player_id, external_player_id, data_type, record_key,
         normalized_payload, raw_payload)
       values ($1, 'aaaaaaaa-0000-0000-0000-000000000001', 'fixture-cmc',
         'projection', 'fixture-cmc:projection',
         '{"type":"projection","scoring":"ppr","projectedPoints":21.7,"stats":{"receptions":5}}'::jsonb,
         '{"projected_points":"21.7","receptions":"5"}'::jsonb)`,
      [snapshotId],
    );
    await db.query(
      `insert into provider_player_identity_records
        (snapshot_id, player_id, external_player_id, normalized_payload,
         raw_payload)
       values ($1, 'aaaaaaaa-0000-0000-0000-000000000001', 'fixture-cmc',
         '{"externalPlayerId":"fixture-cmc","fullName":"Christian McCaffrey","position":"RB","nflTeam":"SF","byeWeek":14,"status":"active","aliases":[]}'::jsonb,
         '{"team":"SF"}'::jsonb)`,
      [snapshotId],
    );
    await db.query(
      `insert into provider_game_records
        (snapshot_id, external_game_id, season, week, season_type,
         kickoff_at, home_team, away_team, home_score, away_score,
         neutral_site, raw_payload)
       values ($1, '2026_01_SF_SEA', 2026, 1, 'REG',
         '2026-09-13T20:25:00Z', 'SEA', 'SF', null, null, false,
         '{"game_id":"2026_01_SF_SEA"}'::jsonb)`,
      [snapshotId],
    );
    await db.query(
      `update provider_ingestion_runs
          set status = 'succeeded', completed_at = '2026-08-20T12:01:01Z'
        where id = $1`,
      [runId],
    );

    const stored = await db.query<{
      normalized_payload: { projectedPoints: number };
      raw_payload: { projected_points: string };
    }>(
      `select normalized_payload, raw_payload
         from provider_data_records where snapshot_id = $1`,
      [snapshotId],
    );
    expect(stored.rows[0]).toEqual({
      normalized_payload: expect.objectContaining({ projectedPoints: 21.7 }),
      raw_payload: { projected_points: "21.7", receptions: "5" },
    });

    await db.query(
      `insert into provider_ingestion_runs
        (id, provider_id, trigger_type, status, adapter_version, season, week,
         started_at, completed_at, records_received)
       values ($1, '33333333-3333-4333-8333-333333333333', 'on_demand',
         'running', '1.0.0', 2026, 1, '2026-08-20T12:02:00Z',
         null, 1)`,
      [replayRunId],
    );

    await expect(
      db.query(
        `insert into provider_data_snapshots
          (provider_id, ingestion_run_id, source_fingerprint, adapter_version,
           season, week, observed_at, imported_at, provenance)
         values ('33333333-3333-4333-8333-333333333333', $1, $2, '1.0.0',
           2026, 1, now(), now(), '{}'::jsonb)`,
        [replayRunId, fingerprint],
      ),
    ).rejects.toThrow();

    await expect(
      db.query(
        `update provider_data_snapshots set observed_at = now() where id = $1`,
        [snapshotId],
      ),
    ).rejects.toThrow(/append-only/);

    await expect(
      db.query(
        `insert into provider_data_records
          (snapshot_id, player_id, external_player_id, data_type, record_key,
           normalized_payload, raw_payload)
         values ($1, 'aaaaaaaa-0000-0000-0000-000000000001', 'fixture-cmc',
           'usage', 'fixture-cmc:late-usage',
           '{"type":"usage","metrics":{"snapShare":0.8}}'::jsonb,
           '{"snap_share":0.8}'::jsonb)`,
        [snapshotId],
      ),
    ).rejects.toThrow(/sealed/);

    await expect(
      db.query(
        `update provider_player_identity_records
            set raw_payload = '{}'::jsonb where snapshot_id = $1`,
        [snapshotId],
      ),
    ).rejects.toThrow(/append-only/);

    await expect(
      db.query(`delete from provider_game_records where snapshot_id = $1`, [
        snapshotId,
      ]),
    ).rejects.toThrow(/append-only/);
  });

  it("returns records only from each provider's freshest applicable snapshot", async () => {
    const oldRunId = "ffffffff-0000-4000-8000-000000000001";
    const newRunId = "ffffffff-0000-4000-8000-000000000002";
    const oldSnapshotId = "ffffffff-0000-4000-8000-000000000003";
    const newSnapshotId = "ffffffff-0000-4000-8000-000000000004";
    const providerId = "33333333-3333-4333-8333-333333333333";
    const playerId = "aaaaaaaa-0000-0000-0000-000000000001";

    for (const [runId, startedAt] of [
      [oldRunId, "2026-08-20T12:01:00Z"],
      [newRunId, "2026-08-20T13:01:00Z"],
    ]) {
      await db.query(
        `insert into provider_ingestion_runs
          (id, provider_id, trigger_type, status, adapter_version, season,
           week, started_at, completed_at)
         values ($1, $2, 'scheduled', 'running', '1.0.0', 2026, 2,
           $3, null)`,
        [runId, providerId, startedAt],
      );
    }

    await db.query(
      `insert into provider_data_snapshots
        (id, provider_id, ingestion_run_id, source_fingerprint,
         adapter_version, season, week, observed_at, imported_at, provenance)
       values
        ($1, $3, $4, $6, '1.0.0', 2026, 2, '2026-08-20T12:00:00Z',
         '2026-08-20T12:01:00Z', $8::jsonb),
        ($2, $3, $5, $7, '1.0.0', 2026, 2, '2026-08-20T13:00:00Z',
         '2026-08-20T13:01:00Z', $8::jsonb)`,
      [
        oldSnapshotId,
        newSnapshotId,
        providerId,
        oldRunId,
        newRunId,
        "b".repeat(64),
        "c".repeat(64),
        JSON.stringify({
          source: "Fixture Fantasy Data",
          sourceId: "freshness-test",
          sourceUrl: null,
          notes: [],
        }),
      ],
    );
    await db.query(
      `insert into provider_data_records
        (snapshot_id, player_id, external_player_id, data_type, record_key,
         normalized_payload, raw_payload)
       values
        ($1, $3, 'fixture-cmc', 'projection', 'fixture-cmc:projection',
         '{"type":"projection","scoring":"ppr","projectedPoints":10,"stats":{}}'::jsonb,
         '{"points":10}'::jsonb),
        ($1, $3, 'fixture-cmc', 'projection', 'fixture-cmc:old-only',
         '{"type":"projection","scoring":"ppr","projectedPoints":99,"stats":{}}'::jsonb,
         '{"points":99}'::jsonb),
        ($2, $3, 'fixture-cmc', 'projection', 'fixture-cmc:projection',
         '{"type":"projection","scoring":"ppr","projectedPoints":20,"stats":{}}'::jsonb,
         '{"points":20}'::jsonb)`,
      [oldSnapshotId, newSnapshotId, playerId],
    );
    await db.query(
      `update provider_ingestion_runs
          set status = 'succeeded', completed_at = started_at
        where id in ($1, $2)`,
      [oldRunId, newRunId],
    );

    const result = await db.query<{
      snapshot_id: string;
      record_key: string;
      normalized_payload: { projectedPoints: number };
    }>(LATEST_PLAYER_DATA_SQL, [playerId, "projection", 2026, 2]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      snapshot_id: newSnapshotId,
      record_key: "fixture-cmc:projection",
      normalized_payload: { projectedPoints: 20 },
    });
  });

  it("preserves raw values from multiple sources without collapsing (ADR-002)", async () => {
    const result = await db.query<{
      provider_count: number;
      row_count: number;
    }>(
      `select count(distinct provider_id)::int as provider_count,
              count(*)::int as row_count
         from player_projections
        where player_id = 'aaaaaaaa-0000-0000-0000-000000000001'`,
    );
    // McCaffrey has projections from two providers, kept side by side.
    expect(result.rows[0]!.provider_count).toBe(2);
    expect(result.rows[0]!.row_count).toBe(2);
  });

  it("maps provider external ids to canonical players (ADR-002)", async () => {
    const result = await db.query<{ full_name: string }>(
      `select p.full_name
         from player_external_ids x
         join players p on p.id = x.player_id
         join providers pr on pr.id = x.provider_id
        where pr.slug = 'mock-adp' and x.external_id = 'adp-4029'`,
    );
    expect(result.rows[0]?.full_name).toBe("Christian McCaffrey");
  });

  it("keeps player identity stable through team changes and free agency", async () => {
    const playerId = "dddddddd-0000-4000-8000-000000000001";
    try {
      await db.query(
        `insert into players
          (id, full_name, position, nfl_team, bye_week, status)
         values ($1, 'Team Change Player', 'RB', 'NYJ', 12, 'active')`,
        [playerId],
      );
      await db.query(
        `update players
            set nfl_team = null, bye_week = null, status = 'inactive'
          where id = $1`,
        [playerId],
      );

      const result = await db.query<{
        id: string;
        nfl_team: string | null;
        bye_week: number | null;
        status: string;
      }>(`select id, nfl_team, bye_week, status from players where id = $1`, [
        playerId,
      ]);
      expect(result.rows).toEqual([
        {
          id: playerId,
          nfl_team: null,
          bye_week: null,
          status: "inactive",
        },
      ]);
    } finally {
      await db.query("delete from players where id = $1", [playerId]);
    }
  });

  it("rejects invalid canonical player details", async () => {
    await expect(
      db.exec(`insert into players
        (full_name, position, nfl_team, bye_week, status)
        values ('Invalid Bye', 'WR', 'NYG', 23, 'active')`),
    ).rejects.toThrow();

    await expect(
      db.exec(`insert into players
        (full_name, position, nfl_team, bye_week, status)
        values ('Invalid Status', 'WR', 'NYG', 14, 'available')`),
    ).rejects.toThrow();
  });

  it("enforces the provider/external-id uniqueness constraint", async () => {
    await expect(
      db.exec(
        `insert into player_external_ids (player_id, provider_id, external_id)
         values ('aaaaaaaa-0000-0000-0000-000000000002',
                 '22222222-2222-2222-2222-222222222222', 'adp-4029')`,
      ),
    ).rejects.toThrow();

    await expect(
      db.exec(
        `insert into player_external_ids (player_id, provider_id, external_id)
         values ('aaaaaaaa-0000-0000-0000-000000000002',
                 '22222222-2222-2222-2222-222222222222', '   ')`,
      ),
    ).rejects.toThrow();
  });

  it("re-running the seed is idempotent", async () => {
    await db.exec(readFileSync(SEED_FILE, "utf8"));
    expect(await count(db, "players")).toBe(4);
    expect(await count(db, "player_projections")).toBe(5);
  });
});
