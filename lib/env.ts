import { z } from "zod";

/**
 * Centralized, validated environment access.
 *
 * Per the Technical Architecture, secrets and provider credentials are handled
 * server-side. This module distinguishes:
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

const optionalTrimmedString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const projectionProviderSchema = z.object({
  FANTASYPROS_API_KEY: optionalTrimmedString,
  FANTASYNERDS_API_KEY: optionalTrimmedString,
});

const yahooOAuthSchema = z.object({
  YAHOO_CLIENT_ID: z.string().trim().min(1, "YAHOO_CLIENT_ID is required"),
  YAHOO_CLIENT_SECRET: z
    .string()
    .trim()
    .min(1, "YAHOO_CLIENT_SECRET is required"),
  YAHOO_REDIRECT_URI: z.string().url("YAHOO_REDIRECT_URI must be a valid URL"),
});

const yahooValidationSchema = yahooOAuthSchema.extend({
  YAHOO_AUTHORIZATION_CODE: optionalTrimmedString,
  YAHOO_RETURNED_STATE: optionalTrimmedString,
  YAHOO_ACCESS_TOKEN: optionalTrimmedString,
  YAHOO_REFRESH_TOKEN: optionalTrimmedString,
  YAHOO_LEAGUE_KEY: optionalTrimmedString,
  YAHOO_TEAM_KEY: optionalTrimmedString,
  YAHOO_WEEK: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.coerce.number().int().min(1).max(22).optional(),
  ),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;
export type YahooOAuthEnv = z.infer<typeof yahooOAuthSchema>;
export type YahooValidationEnv = z.infer<typeof yahooValidationSchema>;
export type ProjectionProviderEnv = z.infer<typeof projectionProviderSchema>;

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

/** Optional server-only credentials for paid projection sources. */
export function getProjectionProviderEnv(): ProjectionProviderEnv {
  return projectionProviderSchema.parse({
    FANTASYPROS_API_KEY: process.env.FANTASYPROS_API_KEY,
    FANTASYNERDS_API_KEY: process.env.FANTASYNERDS_API_KEY,
  });
}

/**
 * Parse the Yahoo OAuth application credentials used by the NOC-52 validation
 * harness. These values are server-side only and must never be exposed through
 * a NEXT_PUBLIC_ variable.
 */
export function getYahooOAuthEnv(): YahooOAuthEnv {
  const parsed = yahooOAuthSchema.safeParse({
    YAHOO_CLIENT_ID: process.env.YAHOO_CLIENT_ID,
    YAHOO_CLIENT_SECRET: process.env.YAHOO_CLIENT_SECRET,
    YAHOO_REDIRECT_URI: process.env.YAHOO_REDIRECT_URI,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid Yahoo OAuth environment configuration:\n${formatIssues(parsed.error)}\n` +
        "See .env.example for the required variables.",
    );
  }

  return parsed.data;
}

/** Parse optional, local-only inputs for the Yahoo capability probe. */
export function getYahooValidationEnv(): YahooValidationEnv {
  const parsed = yahooValidationSchema.safeParse({
    ...getYahooOAuthEnv(),
    YAHOO_AUTHORIZATION_CODE: process.env.YAHOO_AUTHORIZATION_CODE,
    YAHOO_RETURNED_STATE: process.env.YAHOO_RETURNED_STATE,
    YAHOO_ACCESS_TOKEN: process.env.YAHOO_ACCESS_TOKEN,
    YAHOO_REFRESH_TOKEN: process.env.YAHOO_REFRESH_TOKEN,
    YAHOO_LEAGUE_KEY: process.env.YAHOO_LEAGUE_KEY,
    YAHOO_TEAM_KEY: process.env.YAHOO_TEAM_KEY,
    YAHOO_WEEK: process.env.YAHOO_WEEK,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid Yahoo validation environment configuration:\n${formatIssues(parsed.error)}\n` +
        "See .env.example for the supported variables.",
    );
  }

  return parsed.data;
}
