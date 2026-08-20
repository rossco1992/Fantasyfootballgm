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
      ]),
    );
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

  it("enforces the provider/external-id uniqueness constraint", async () => {
    await expect(
      db.exec(
        `insert into player_external_ids (player_id, provider_id, external_id)
         values ('aaaaaaaa-0000-0000-0000-000000000002',
                 '22222222-2222-2222-2222-222222222222', 'adp-4029')`,
      ),
    ).rejects.toThrow();
  });

  it("re-running the seed is idempotent", async () => {
    await db.exec(readFileSync(SEED_FILE, "utf8"));
    expect(await count(db, "players")).toBe(4);
    expect(await count(db, "player_projections")).toBe(5);
  });
});
