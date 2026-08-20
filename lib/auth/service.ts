import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuthOutcome } from "@/lib/auth/types";

type AuthClient = Pick<SupabaseClient, "auth">;

function friendlyAuthError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Confirm your email address before signing in.";
  }
  if (
    normalized.includes("already registered") ||
    normalized.includes("already exists")
  ) {
    return "An account with this email already exists.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  if (normalized.includes("same password")) {
    return "Choose a password you have not used for this account.";
  }

  return message || "Authentication could not be completed. Try again.";
}

export async function registerUser(
  client: AuthClient,
  email: string,
  password: string,
  emailRedirectTo: string,
): Promise<AuthOutcome> {
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });

  if (error) return { ok: false, message: friendlyAuthError(error.message) };
  return { ok: true, requiresEmailConfirmation: !data.session };
}

export async function signInUser(
  client: AuthClient,
  email: string,
  password: string,
): Promise<AuthOutcome> {
  const { error } = await client.auth.signInWithPassword({ email, password });
  return error
    ? { ok: false, message: friendlyAuthError(error.message) }
    : { ok: true };
}

export async function signOutUser(client: AuthClient): Promise<AuthOutcome> {
  const { error } = await client.auth.signOut();
  return error
    ? { ok: false, message: friendlyAuthError(error.message) }
    : { ok: true };
}

export async function sendPasswordReset(
  client: AuthClient,
  email: string,
  redirectTo: string,
): Promise<AuthOutcome> {
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  return error
    ? { ok: false, message: friendlyAuthError(error.message) }
    : { ok: true };
}

export async function updatePassword(
  client: AuthClient,
  password: string,
): Promise<AuthOutcome> {
  const { error } = await client.auth.updateUser({ password });
  return error
    ? { ok: false, message: friendlyAuthError(error.message) }
    : { ok: true };
}
