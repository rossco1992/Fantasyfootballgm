import { describe, expect, it } from "vitest";

import {
  credentialsSchema,
  emailSchema,
  passwordUpdateSchema,
} from "@/lib/auth/validation";

describe("auth validation", () => {
  it("accepts valid credentials", () => {
    expect(
      credentialsSchema.safeParse({
        email: "gm@example.com",
        password: "strong-pass",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid emails and short passwords", () => {
    const result = credentialsSchema.safeParse({ email: "bad", password: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toBeDefined();
      expect(result.error.flatten().fieldErrors.password).toBeDefined();
    }
  });

  it("requires matching replacement passwords", () => {
    const result = passwordUpdateSchema.safeParse({
      password: "strong-pass",
      confirmPassword: "different-pass",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmPassword).toContain(
        "Passwords do not match.",
      );
    }
  });

  it("validates password-reset email input", () => {
    expect(emailSchema.safeParse({ email: "gm@example.com" }).success).toBe(
      true,
    );
    expect(emailSchema.safeParse({ email: "" }).success).toBe(false);
  });
});
