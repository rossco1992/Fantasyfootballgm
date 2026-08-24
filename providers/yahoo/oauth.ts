import { randomBytes } from "node:crypto";

import { z } from "zod";

export const YAHOO_AUTHORIZATION_ENDPOINT =
  "https://api.login.yahoo.com/oauth2/request_auth";
export const YAHOO_TOKEN_ENDPOINT =
  "https://api.login.yahoo.com/oauth2/get_token";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.coerce.number().int().positive(),
  token_type: z.string().min(1),
});

const tokenErrorSchema = z.object({
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export type YahooOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type YahooTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  expiresAt: string;
  tokenType: "bearer";
};

export class YahooOAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly oauthCode: string | null,
  ) {
    super(message);
    this.name = "YahooOAuthError";
  }
}

function base64Url(value: Buffer): string {
  return value.toString("base64url");
}

export function createYahooOAuthState(): string {
  return base64Url(randomBytes(32));
}

export function createYahooAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(YAHOO_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  return url.toString();
}

function basicAuthorization(config: YahooOAuthConfig): string {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
}

function safeTokenError(status: number, rawBody: string): YahooOAuthError {
  let oauthCode: string | null = null;
  let description: string | null = null;
  try {
    const parsed = tokenErrorSchema.safeParse(JSON.parse(rawBody));
    if (parsed.success) {
      oauthCode = parsed.data.error ?? null;
      description = parsed.data.error_description ?? null;
    }
  } catch {
    // Yahoo may return HTML for a transient gateway failure. Do not echo it or
    // any request credentials into logs.
  }

  const detail = [oauthCode, description].filter(Boolean).join(": ");
  return new YahooOAuthError(
    `Yahoo token request failed with HTTP ${status}${detail ? ` (${detail})` : ""}.`,
    status,
    oauthCode,
  );
}

export class YahooOAuthClient {
  constructor(
    private readonly config: YahooOAuthConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async exchangeAuthorizationCode(
    authorizationCode: string,
  ): Promise<YahooTokenSet> {
    return this.requestToken(
      {
        grant_type: "authorization_code",
        redirect_uri: this.config.redirectUri,
        code: authorizationCode,
      },
      null,
    );
  }

  async refreshAccessToken(refreshToken: string): Promise<YahooTokenSet> {
    return this.requestToken(
      {
        grant_type: "refresh_token",
        redirect_uri: this.config.redirectUri,
        refresh_token: refreshToken,
      },
      refreshToken,
    );
  }

  private async requestToken(
    form: Record<string, string>,
    previousRefreshToken: string | null,
  ): Promise<YahooTokenSet> {
    const response = await this.fetcher(YAHOO_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: basicAuthorization(this.config),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(15_000),
    });

    const rawBody = await response.text();
    if (!response.ok) throw safeTokenError(response.status, rawBody);

    const parsed = tokenResponseSchema.parse(JSON.parse(rawBody));
    if (parsed.token_type.toLowerCase() !== "bearer") {
      throw new YahooOAuthError(
        "Yahoo returned an unsupported token type.",
        response.status,
        null,
      );
    }

    const refreshToken = parsed.refresh_token ?? previousRefreshToken;
    if (!refreshToken) {
      throw new YahooOAuthError(
        "Yahoo did not return a refresh token.",
        response.status,
        null,
      );
    }

    return {
      accessToken: parsed.access_token,
      refreshToken,
      expiresInSeconds: parsed.expires_in,
      expiresAt: new Date(
        this.clock().getTime() + parsed.expires_in * 1_000,
      ).toISOString(),
      tokenType: "bearer",
    };
  }
}
