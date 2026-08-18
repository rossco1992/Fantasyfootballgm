import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { closePool, query } from "@/db/client";

/**
 * Load development seed data from `supabase/seed.sql`.
 *
 * The seed is idempotent (fixed UUIDs + ON CONFLICT DO NOTHING), so running it
 * repeatedly is safe. This is the same file the Supabase CLI applies during
 * `supabase db reset`, keeping one source of truth for seed data.
 *
 * Usage: `npm run db:seed` (requires DATABASE_URL, and migrations applied).
 */

const SEED_FILE = join(process.cwd(), "supabase", "seed.sql");

export async function seed(): Promise<void> {
  const sql = readFileSync(SEED_FILE, "utf8");
  await query(sql);
  console.log("seed data applied");
}

const isMain =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  seed()
    .then(() => closePool())
    .catch(async (error) => {
      console.error(error);
      await closePool();
      process.exit(1);
    });
}
