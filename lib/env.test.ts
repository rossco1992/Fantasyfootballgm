import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getFantasyProsEnv, getPublicEnv, getServerEnv } from "@/lib/env";

describe("env", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.FANTASYPROS_API_KEY;
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

  it("parses the server-only FantasyPros API key", () => {
    process.env.FANTASYPROS_API_KEY = "personal-api-key";
    expect(getFantasyProsEnv()).toEqual({
      FANTASYPROS_API_KEY: "personal-api-key",
    });
  });

  it("requires a FantasyPros API key only when the integration is used", () => {
    expect(() => getFantasyProsEnv()).toThrowError(/FANTASYPROS_API_KEY/);
  });
});
