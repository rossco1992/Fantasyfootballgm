import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  registerUser,
  sendPasswordReset,
  signInUser,
  signOutUser,
  updatePassword,
} from "@/lib/auth/service";

function clientWithAuth(auth: Record<string, ReturnType<typeof vi.fn>>) {
  return { auth } as unknown as Pick<SupabaseClient, "auth">;
}

describe("auth service", () => {
  it("registers with an email callback and reports confirmation", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { session: null },
      error: null,
    });
    const result = await registerUser(
      clientWithAuth({ signUp }),
      "gm@example.com",
      "strong-pass",
      "http://localhost:3000/auth/callback?next=/dashboard",
    );

    expect(result).toEqual({ ok: true, requiresEmailConfirmation: true });
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "gm@example.com",
        options: expect.objectContaining({
          emailRedirectTo:
            "http://localhost:3000/auth/callback?next=/dashboard",
        }),
      }),
    );
  });

  it("signs in and translates invalid credentials clearly", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    const result = await signInUser(
      clientWithAuth({ signInWithPassword }),
      "gm@example.com",
      "wrong-pass",
    );
    expect(result).toEqual({
      ok: false,
      message: "The email or password is incorrect.",
    });
  });

  it("signs out", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    await expect(signOutUser(clientWithAuth({ signOut }))).resolves.toEqual({
      ok: true,
    });
  });

  it("requests a password reset without exposing account existence", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    const result = await sendPasswordReset(
      clientWithAuth({ resetPasswordForEmail }),
      "gm@example.com",
      "http://localhost:3000/auth/callback?next=/auth/update-password",
    );
    expect(result).toEqual({ ok: true });
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      "gm@example.com",
      expect.objectContaining({
        redirectTo: expect.stringContaining("/auth/callback"),
      }),
    );
  });

  it("updates an authenticated user's password", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    await expect(
      updatePassword(clientWithAuth({ updateUser }), "new-strong-pass"),
    ).resolves.toEqual({ ok: true });
    expect(updateUser).toHaveBeenCalledWith({ password: "new-strong-pass" });
  });
});
