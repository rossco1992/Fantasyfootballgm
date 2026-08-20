import { describe, expect, it } from "vitest";

import { isProtectedRoute, safeNextPath } from "@/lib/auth/routes";

describe("auth routes", () => {
  it("protects authenticated-only routes", () => {
    expect(isProtectedRoute("/dashboard")).toBe(true);
    expect(isProtectedRoute("/dashboard/leagues")).toBe(true);
    expect(isProtectedRoute("/auth/update-password")).toBe(true);
    expect(isProtectedRoute("/login")).toBe(false);
  });

  it("allows only local redirect destinations", () => {
    expect(safeNextPath("/dashboard/leagues")).toBe("/dashboard/leagues");
    expect(safeNextPath("https://attacker.example")).toBe("/dashboard");
    expect(safeNextPath("//attacker.example")).toBe("/dashboard");
    expect(safeNextPath("/\\attacker.example")).toBe("/dashboard");
  });
});
