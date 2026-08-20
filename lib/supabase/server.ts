import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";

/**
 * Create a Supabase client for use on the server (Server Components, Route
 * Handlers, Server Actions). Reads and writes the Supabase auth session through
 * Next.js cookies.
 *
 * This is the persistence/auth boundary described in ADR-004. Domain services
 * and UI should depend on application services rather than calling Supabase
 * directly, keeping Supabase-specific concerns near this boundary.
 */
export async function createSupabaseServerClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet, headers) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
            // Supabase supplies no-cache headers alongside refreshed auth
            // cookies. Server Components cannot write response headers, but
            // Route Handlers, Server Actions, and the proxy can. The proxy
            // applies these headers to the actual response.
            void headers;
          } catch {
            // `setAll` can be called from a Server Component, where mutating
            // cookies is not allowed. This is safe to ignore when middleware
            // refreshes the session; documented here so it is not mistaken for
            // a silent failure.
          }
        },
      },
    },
  );
}
