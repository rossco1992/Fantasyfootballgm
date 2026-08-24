import { describe, expect, it, vi } from "vitest";

import {
  YahooOAuthClient,
  YahooOAuthError,
  createYahooAuthorizationUrl,
} from "@/providers/yahoo/oauth";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://example.test/yahoo/callback",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Yahoo OAuth validation client", () => {
  it("builds a state-bound authorization-code request", () => {
    const url = new URL(
      createYahooAuthorizationUrl({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        state: "expected-state",
      }),
    );

    expect(url.searchParams.get("client_id")).toBe(config.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("expected-state");
  });

  it("exchanges a code server-side without placing the client secret in the form body", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        token_type: "bearer",
      }),
    ) as unknown as typeof fetch;
    const client = new YahooOAuthClient(
      config,
      fetcher,
      () => new Date("2026-08-23T12:00:00.000Z"),
    );

    const tokens = await client.exchangeAuthorizationCode("authorization-code");
    const [, init] = vi.mocked(fetcher).mock.calls[0]!;
    const body = new URLSearchParams(String(init?.body));

    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toMatch(/^Basic /);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.has("client_secret")).toBe(false);
    expect(tokens).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresInSeconds: 3600,
      expiresAt: "2026-08-23T13:00:00.000Z",
      tokenType: "bearer",
    });
  });

  it("preserves the current refresh token when Yahoo does not rotate it", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        access_token: "new-access-token",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    ) as unknown as typeof fetch;
    const client = new YahooOAuthClient(config, fetcher);

    const tokens = await client.refreshAccessToken("current-refresh-token");
    const [, init] = vi.mocked(fetcher).mock.calls[0]!;
    const body = new URLSearchParams(String(init?.body));

    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("current-refresh-token");
    expect(tokens.refreshToken).toBe("current-refresh-token");
  });

  it("returns a sanitized OAuth error", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        {
          error: "invalid_grant",
          error_description: "Authorization code expired.",
        },
        400,
      ),
    ) as unknown as typeof fetch;
    const client = new YahooOAuthClient(config, fetcher);

    const error = await client
      .exchangeAuthorizationCode("secret-code")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(YahooOAuthError);
    expect(String(error)).toContain("invalid_grant");
    expect(String(error)).not.toContain("secret-code");
    expect(String(error)).not.toContain(config.clientSecret);
  });
});
