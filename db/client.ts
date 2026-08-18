import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";
import { z } from "zod";

/**
 * Low-level database connection for server-side / privileged access.
 *
 * This is the single place that opens a Postgres connection. Application code
 * must go through the repositories in `db/repositories/*` (which use this
 * module) rather than importing `pg` directly — keeping database access
 * isolated behind a clear persistence layer (ADR-004).
 *
 * The connection string points at Supabase Postgres in every real environment;
 * locally it can point at `supabase start`'s database or any Postgres instance.
 */

const connectionSchema = z
  .string()
  .min(1, "DATABASE_URL is required")
  .url("DATABASE_URL must be a valid Postgres connection string");

export function getDatabaseUrl(): string {
  const parsed = connectionSchema.safeParse(process.env.DATABASE_URL);
  if (!parsed.success) {
    throw new Error(
      `Invalid database configuration:\n${parsed.error.issues
        .map((issue) => `  - ${issue.message}`)
        .join("\n")}\nSee .env.example for the required variables.`,
    );
  }
  return parsed.data;
}

// Cache the pool on the global object so Next.js dev hot-reloads and repeated
// imports reuse one pool instead of exhausting connections.
const globalForPool = globalThis as unknown as { __ffgmPool?: Pool };

export function getPool(): Pool {
  if (!globalForPool.__ffgmPool) {
    globalForPool.__ffgmPool = new Pool({ connectionString: getDatabaseUrl() });
  }
  return globalForPool.__ffgmPool;
}

/** Run a parameterized query against the pool. */
export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params as never);
}

/** Run a set of statements inside a single transaction. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Close the pool. Call from scripts/tests; not needed in the app runtime. */
export async function closePool(): Promise<void> {
  if (globalForPool.__ffgmPool) {
    await globalForPool.__ffgmPool.end();
    globalForPool.__ffgmPool = undefined;
  }
}
