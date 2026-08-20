import { query } from "@/db/client";
import { type Provider, providerSchema } from "@/db/types";

/**
 * Data access for providers. All provider reads/writes go through here so that
 * SQL stays isolated behind the persistence layer (ADR-004).
 */

export async function listProviders(): Promise<Provider[]> {
  const result = await query<Provider>(
    "select id, slug, name, created_at from providers order by slug",
  );
  return result.rows.map((row) => providerSchema.parse(row));
}

export async function getProviderBySlug(
  slug: string,
): Promise<Provider | null> {
  const result = await query<Provider>(
    "select id, slug, name, created_at from providers where slug = $1",
    [slug],
  );
  const row = result.rows[0];
  return row ? providerSchema.parse(row) : null;
}
