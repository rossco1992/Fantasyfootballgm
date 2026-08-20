import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readMigrationFiles } from "@/db/migrate";

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
    expect(await count(db, "providers")).toBe(2);
    expect(await count(db, "players")).toBe(4);
    expect(await count(db, "player_external_ids")).toBe(5);
    expect(await count(db, "player_projections")).toBe(5);
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
