import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { getYahooOAuthEnv, getYahooValidationEnv } from "@/lib/env";
import { YahooReadOnlyCapabilityProbe } from "@/providers/yahoo/capability-probe";
import {
  YahooOAuthClient,
  createYahooAuthorizationUrl,
  createYahooOAuthState,
} from "@/providers/yahoo/oauth";

const validationDirectory = path.join(process.cwd(), ".yahoo-validation");
const authorizationSessionPath = path.join(
  validationDirectory,
  "authorization-session.json",
);
const tokenCachePath = path.join(validationDirectory, "refresh-token.json");

const authorizationSessionSchema = z.object({
  state: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
});

const tokenCacheSchema = z.object({
  refreshToken: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }),
});

type JsonObject = Record<string, unknown>;

function isMissingFile(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function readPrivateJson(pathname: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(pathname, "utf8"));
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

async function writePrivateJson(
  pathname: string,
  value: JsonObject,
): Promise<void> {
  await mkdir(validationDirectory, { recursive: true, mode: 0o700 });
  await chmod(validationDirectory, 0o700);
  const temporaryPath = `${pathname}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, pathname);
  await chmod(pathname, 0o600);
}

function oauthClient() {
  const env = getYahooOAuthEnv();
  return new YahooOAuthClient({
    clientId: env.YAHOO_CLIENT_ID,
    clientSecret: env.YAHOO_CLIENT_SECRET,
    redirectUri: env.YAHOO_REDIRECT_URI,
  });
}

async function printAuthorizationUrl(): Promise<void> {
  const env = getYahooOAuthEnv();
  const state = createYahooOAuthState();
  await writePrivateJson(authorizationSessionPath, {
    state,
    createdAt: new Date().toISOString(),
  });

  const url = createYahooAuthorizationUrl({
    clientId: env.YAHOO_CLIENT_ID,
    redirectUri: env.YAHOO_REDIRECT_URI,
    state,
  });

  console.log(url);
  console.log(
    "\nExpected OAuth state saved locally in .yahoo-validation/. " +
      "Do not paste the authorization code, state, or credentials into a ticket or chat.",
  );
}

async function cachedRefreshToken(): Promise<string | null> {
  const cached = await readPrivateJson(tokenCachePath);
  if (cached === null) return null;
  return tokenCacheSchema.parse(cached).refreshToken;
}

async function saveRefreshToken(refreshToken: string): Promise<void> {
  await writePrivateJson(tokenCachePath, {
    refreshToken,
    updatedAt: new Date().toISOString(),
  });
}

async function runProbe(): Promise<void> {
  const env = getYahooValidationEnv();
  const client = oauthClient();
  let accessToken: string;
  let refreshToken: string | null = null;
  let authorizationCodeExchange: "supported" | "not_tested" = "not_tested";
  let refreshTokenExchange: "supported" | "not_tested" | "failed" =
    "not_tested";
  let accessTokenLifetimeSeconds: number | null = null;
  let refreshFailure: string | null = null;

  if (env.YAHOO_ACCESS_TOKEN) {
    accessToken = env.YAHOO_ACCESS_TOKEN;
  } else if (env.YAHOO_AUTHORIZATION_CODE) {
    const storedSession = authorizationSessionSchema.parse(
      await readPrivateJson(authorizationSessionPath),
    );
    if (!env.YAHOO_RETURNED_STATE) {
      throw new Error(
        "YAHOO_RETURNED_STATE is required with YAHOO_AUTHORIZATION_CODE.",
      );
    }
    if (env.YAHOO_RETURNED_STATE !== storedSession.state) {
      throw new Error(
        "Yahoo OAuth state mismatch; start a new authorization flow.",
      );
    }

    const tokens = await client.exchangeAuthorizationCode(
      env.YAHOO_AUTHORIZATION_CODE,
    );
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    accessTokenLifetimeSeconds = tokens.expiresInSeconds;
    authorizationCodeExchange = "supported";
    await saveRefreshToken(tokens.refreshToken);
  } else {
    refreshToken = env.YAHOO_REFRESH_TOKEN ?? (await cachedRefreshToken());
    if (!refreshToken) {
      throw new Error(
        "No Yahoo token is available. Run yahoo:auth-url, or configure a local access/refresh token.",
      );
    }
    const tokens = await client.refreshAccessToken(refreshToken);
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    accessTokenLifetimeSeconds = tokens.expiresInSeconds;
    refreshTokenExchange = "supported";
    await saveRefreshToken(tokens.refreshToken);
  }

  const report = await new YahooReadOnlyCapabilityProbe().run({
    accessToken,
    leagueKey: env.YAHOO_LEAGUE_KEY,
    teamKey: env.YAHOO_TEAM_KEY,
    week: env.YAHOO_WEEK,
  });

  if (authorizationCodeExchange === "supported" && refreshToken) {
    try {
      const refreshed = await client.refreshAccessToken(refreshToken);
      refreshTokenExchange = "supported";
      accessTokenLifetimeSeconds = refreshed.expiresInSeconds;
      await saveRefreshToken(refreshed.refreshToken);
    } catch (error) {
      refreshTokenExchange = "failed";
      refreshFailure = error instanceof Error ? error.message : String(error);
      process.exitCode = 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        oauth: {
          authorizationCodeExchange,
          refreshTokenExchange,
          accessTokenLifetimeSeconds,
          refreshTokenStoredInGitIgnoredLocalCache: refreshToken !== null,
          secretsPrinted: false,
          refreshFailure,
        },
        report,
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "auth-url") {
    await printAuthorizationUrl();
    return;
  }
  if (command === "probe") {
    await runProbe();
    return;
  }
  throw new Error("Usage: yahoo-capability-probe.ts <auth-url|probe>");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
