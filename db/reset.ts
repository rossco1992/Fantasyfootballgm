import { pathToFileURL } from "node:url";

import { closePool, query } from "@/db/client";
import { migrate } from "@/db/migrate";
import { seed } from "@/db/seed";

/**
 * Recreate the database from scratch: drop the public schema, re-apply all
 * migrations, then seed. This is the Docker-free equivalent of
 * `supabase db reset` and satisfies "a fresh database can be created from
 * migrations".
 *
 * DESTRUCTIVE — refuses to run when NODE_ENV=production.
 *
 * Usage: `npm run db:reset` (requires DATABASE_URL).
 */

export async function reset(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("db:reset is disabled when NODE_ENV=production");
  }
  await query("drop schema if exists public cascade");
  await query("create schema public");
  await migrate();
  await seed();
  console.log("database reset complete");
}

const isMain =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  reset()
    .then(() => closePool())
    .catch(async (error) => {
      console.error(error);
      await closePool();
      process.exit(1);
    });
}
