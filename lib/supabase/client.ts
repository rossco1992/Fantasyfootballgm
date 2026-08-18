import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";

/**
 * Create a Supabase client for use in the browser (Client Components).
 *
 * Only the public URL and anon key are used here; privileged operations must
 * run server-side. See ADR-004 (Supabase for MVP Persistence and
 * Authentication) and the Technical Architecture's principle of preferring
 * server-side access for secrets and privileged database operations.
 */
export function createSupabaseBrowserClient() {
  const env = getPublicEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
