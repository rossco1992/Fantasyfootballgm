import { describe, expect, it } from "vitest";

import {
  isGuestOnlyRoute,
  isProtectedRoute,
  safeNextPath,
} from "@/lib/auth/routes";

describe("auth routes", () => {
  it("protects authenticated-only routes", () => {
    expect(isProtectedRoute("/dashboard")).toBe(true);
    expect(isProtectedRoute("/dashboard/leagues")).toBe(true);
    expect(isProtectedRoute("/auth/update-password")).toBe(true);
    expect(isProtectedRoute("/login")).toBe(false);
  });

  it("identifies entry routes that authenticated users should not revisit", () => {
    expect(isGuestOnlyRoute("/")).toBe(true);
    expect(isGuestOnlyRoute("/login")).toBe(true);
    expect(isGuestOnlyRoute("/register")).toBe(true);
    expect(isGuestOnlyRoute("/auth/forgot-password")).toBe(false);
    expect(isGuestOnlyRoute("/dashboard")).toBe(false);
  });

  it("allows only local redirect destinations", () => {
    expect(safeNextPath("/dashboard/leagues")).toBe("/dashboard/leagues");
    expect(safeNextPath("https://attacker.example")).toBe("/dashboard");
    expect(safeNextPath("//attacker.example")).toBe("/dashboard");
    expect(safeNextPath("/\\attacker.example")).toBe("/dashboard");
  });
});
