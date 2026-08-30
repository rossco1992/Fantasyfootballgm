import { z } from "zod";

/**
 * Centralized, validated environment access.
 *
 * Per the Technical Architecture, secrets are handled server-side. This module
 * distinguishes:
 *
 *  - Public variables (`NEXT_PUBLIC_*`) that are safe to expose to the browser.
 *  - Server-only variables that must never reach client bundles.
 *
 * Values are parsed lazily so that importing this module in a context that only
 * needs public variables does not require server secrets to be present.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
});

const serverSchema = z.object({
  // Privileged Supabase key for server-side, service-role operations only.
  // Never expose this to the browser.
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
});

const fantasyProsSchema = z.object({
  FANTASYPROS_API_KEY: z
    .string()
    .trim()
    .min(1, "FANTASYPROS_API_KEY is required"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;
export type FantasyProsEnv = z.infer<typeof fantasyProsSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".") || "(root)";
      return `  - ${path}: ${issue.message}`;
    })
    .join("\n");
}

/**
 * Parse and return the public (browser-safe) environment variables.
 * Throws a descriptive error when configuration is missing or malformed.
 */
export function getPublicEnv(): PublicEnv {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment configuration:\n${formatIssues(parsed.error)}\n` +
        "See .env.example for the required variables.",
    );
  }

  return parsed.data;
}

/**
 * Parse and return the server-only environment variables.
 * Must only be called from server-side code (route handlers, server
 * components, server actions, scripts). Throws when called with missing config.
 */
export function getServerEnv(): ServerEnv {
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment configuration:\n${formatIssues(parsed.error)}\n` +
        "See .env.example for the required variables.",
    );
  }

  return parsed.data;
}

/** Server-only credentials for the FantasyPros Public API. */
export function getFantasyProsEnv(): FantasyProsEnv {
  const parsed = fantasyProsSchema.safeParse({
    FANTASYPROS_API_KEY: process.env.FANTASYPROS_API_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid FantasyPros environment configuration:\n${formatIssues(parsed.error)}\n` +
        "See .env.example for the required variable.",
    );
  }
  return parsed.data;
}
