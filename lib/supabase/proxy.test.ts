import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getClaims } })),
}));

vi.mock("@/lib/env", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  }),
}));

import { updateSession } from "@/lib/supabase/proxy";

describe("auth session proxy", () => {
  beforeEach(() => {
    getClaims.mockReset();
  });

  it.each(["/", "/login", "/register"])(
    "redirects an authenticated user from %s to the dashboard",
    async (pathname) => {
      getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });

      const response = await updateSession(
        new NextRequest(`https://fantasy.test${pathname}`),
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://fantasy.test/dashboard",
      );
    },
  );

  it("preserves the requested path when redirecting an anonymous user", async () => {
    getClaims.mockResolvedValue({ data: { claims: {} } });

    const response = await updateSession(
      new NextRequest("https://fantasy.test/dashboard?week=1"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://fantasy.test/login?next=%2Fdashboard%3Fweek%3D1",
    );
  });

  it("leaves the login page available to an anonymous user", async () => {
    getClaims.mockResolvedValue({ data: { claims: {} } });

    const response = await updateSession(
      new NextRequest("https://fantasy.test/login"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
