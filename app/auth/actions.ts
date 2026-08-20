"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  registerUser,
  sendPasswordReset,
  signInUser,
  signOutUser,
  updatePassword,
} from "@/lib/auth/service";
import type { AuthFormState } from "@/lib/auth/types";
import {
  credentialsSchema,
  emailSchema,
  passwordUpdateSchema,
} from "@/lib/auth/validation";
import { safeNextPath } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requestOrigin() {
  const requestHeaders = await headers();
  return requestHeaders.get("origin") ?? "http://localhost:3000";
}

export async function registerAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createSupabaseServerClient();
  const outcome = await registerUser(
    supabase,
    parsed.data.email,
    parsed.data.password,
    `${await requestOrigin()}/auth/callback?next=/dashboard`,
  );
  if (!outcome.ok) return { status: "error", message: outcome.message };
  if (outcome.requiresEmailConfirmation) {
    return {
      status: "success",
      message: "Check your email to confirm your account, then sign in.",
    };
  }
  redirect("/dashboard");
}

export async function loginAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createSupabaseServerClient();
  const outcome = await signInUser(
    supabase,
    parsed.data.email,
    parsed.data.password,
  );
  if (!outcome.ok) return { status: "error", message: outcome.message };

  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  const outcome = await signOutUser(supabase);
  if (!outcome.ok) {
    redirect(
      `/dashboard?message=${encodeURIComponent("Sign out failed. Try again.")}`,
    );
  }
  redirect("/login?message=You%20have%20been%20signed%20out.");
}

export async function forgotPasswordAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter a valid email address.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createSupabaseServerClient();
  const outcome = await sendPasswordReset(
    supabase,
    parsed.data.email,
    `${await requestOrigin()}/auth/callback?next=/auth/update-password`,
  );
  if (!outcome.ok) return { status: "error", message: outcome.message };

  return {
    status: "success",
    message:
      "If an account exists for that email, a password-reset link is on its way.",
  };
}

export async function updatePasswordAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = passwordUpdateSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) {
    return {
      status: "error",
      message: "This reset link is invalid or expired. Request a new one.",
    };
  }

  const outcome = await updatePassword(supabase, parsed.data.password);
  if (!outcome.ok) return { status: "error", message: outcome.message };
  redirect("/dashboard?message=Password%20updated%20successfully.");
}
