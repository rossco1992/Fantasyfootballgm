import { withTransaction } from "@/db/client";

/**
 * Serialize refreshes for one provider across app instances. The freshness
 * check runs inside the lock, so a second request observes the first request's
 * successful snapshot instead of calling the provider again.
 */
export async function withProviderRefreshLock<T>(
  providerSlug: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      providerSlug,
    ]);
    return operation();
  });
}
