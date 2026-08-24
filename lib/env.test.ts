import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getPublicEnv,
  getServerEnv,
  getYahooOAuthEnv,
  getYahooValidationEnv,
} from "@/lib/env";

describe("env", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.YAHOO_CLIENT_ID;
    delete process.env.YAHOO_CLIENT_SECRET;
    delete process.env.YAHOO_REDIRECT_URI;
    delete process.env.YAHOO_AUTHORIZATION_CODE;
    delete process.env.YAHOO_RETURNED_STATE;
    delete process.env.YAHOO_ACCESS_TOKEN;
    delete process.env.YAHOO_REFRESH_TOKEN;
    delete process.env.YAHOO_LEAGUE_KEY;
    delete process.env.YAHOO_TEAM_KEY;
    delete process.env.YAHOO_WEEK;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("parses valid public env", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    expect(getPublicEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
  });

  it("throws a descriptive error when public env is missing", () => {
    expect(() => getPublicEnv()).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("throws when the public URL is not a valid URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-url";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    expect(() => getPublicEnv()).toThrowError(/valid URL/);
  });

  it("parses valid server env", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    expect(getServerEnv()).toEqual({
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    });
  });

  it("throws a descriptive error when server env is missing", () => {
    expect(() => getServerEnv()).toThrowError(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("keeps Yahoo OAuth credentials server-only and validates the redirect URL", () => {
    process.env.YAHOO_CLIENT_ID = "client-id";
    process.env.YAHOO_CLIENT_SECRET = "client-secret";
    process.env.YAHOO_REDIRECT_URI = "https://example.test/yahoo/callback";

    expect(getYahooOAuthEnv()).toEqual({
      YAHOO_CLIENT_ID: "client-id",
      YAHOO_CLIENT_SECRET: "client-secret",
      YAHOO_REDIRECT_URI: "https://example.test/yahoo/callback",
    });

    process.env.YAHOO_REDIRECT_URI = "not-a-url";
    expect(() => getYahooOAuthEnv()).toThrowError(/YAHOO_REDIRECT_URI/);
  });

  it("parses optional Yahoo validation scope without requiring live tokens", () => {
    process.env.YAHOO_CLIENT_ID = "client-id";
    process.env.YAHOO_CLIENT_SECRET = "client-secret";
    process.env.YAHOO_REDIRECT_URI = "https://example.test/yahoo/callback";
    process.env.YAHOO_LEAGUE_KEY = "461.l.2026";
    process.env.YAHOO_WEEK = "2";

    expect(getYahooValidationEnv()).toMatchObject({
      YAHOO_LEAGUE_KEY: "461.l.2026",
      YAHOO_WEEK: 2,
    });
  });
});
