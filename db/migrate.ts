import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { closePool, query, withTransaction } from "@/db/client";

/**
 * Apply pending SQL migrations from `supabase/migrations` in filename order.
 *
 * Applied migrations are recorded in `schema_migrations`, so this is safe to run
 * repeatedly and only applies what is missing. Each migration runs inside a
 * transaction. The same `.sql` files are also understood by the Supabase CLI
 * (`supabase db reset`), so there is a single source of truth for the schema.
 *
 * Usage: `npm run db:migrate` (requires DATABASE_URL).
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

export function readMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export async function migrate(): Promise<string[]> {
  await query(
    `create table if not exists schema_migrations (
       version    text        primary key,
       applied_at timestamptz not null default now()
     )`,
  );

  const applied = new Set(
    (
      await query<{ version: string }>("select version from schema_migrations")
    ).rows.map((row) => row.version),
  );

  const pending = readMigrationFiles().filter((file) => !applied.has(file));
  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query(
        "insert into schema_migrations (version) values ($1)",
        [file],
      );
    });
    console.log(`applied ${file}`);
  }

  if (pending.length === 0) {
    console.log("no pending migrations");
  }
  return pending;
}

// Run when invoked directly (npm run db:migrate).
const isMain =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  migrate()
    .then(() => closePool())
    .catch(async (error) => {
      console.error(error);
      await closePool();
      process.exit(1);
    });
}
