import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getPublicEnv, getServerEnv } from "@/lib/env";

describe("env", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
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
});
