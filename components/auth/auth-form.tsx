"use client";

import Link from "next/link";
import { useActionState } from "react";

import { initialAuthFormState, type AuthFormState } from "@/lib/auth/types";

type AuthAction = (
  state: AuthFormState,
  formData: FormData,
) => Promise<AuthFormState>;

export function AuthForm({
  action,
  submitLabel,
  kind,
  next,
  showForgotPassword = false,
}: {
  action: AuthAction;
  submitLabel: string;
  kind: "credentials" | "email" | "new-password";
  next?: string;
  showForgotPassword?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    initialAuthFormState,
  );
  const inputClass =
    "mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-neutral-700 dark:bg-neutral-950";

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {kind !== "new-password" ? (
        <label className="block text-sm font-medium">
          Email
          <input
            className={inputClass}
            name="email"
            type="email"
            autoComplete="email"
            aria-invalid={state.fieldErrors?.email ? true : undefined}
            required
          />
          <FieldError messages={state.fieldErrors?.email} />
        </label>
      ) : null}

      {kind === "credentials" || kind === "new-password" ? (
        <label className="block text-sm font-medium">
          {kind === "new-password" ? "New password" : "Password"}
          <input
            className={inputClass}
            name="password"
            type="password"
            autoComplete={
              kind === "new-password" ? "new-password" : "current-password"
            }
            aria-invalid={state.fieldErrors?.password ? true : undefined}
            required
          />
          <FieldError messages={state.fieldErrors?.password} />
        </label>
      ) : null}

      {kind === "new-password" ? (
        <label className="block text-sm font-medium">
          Confirm new password
          <input
            className={inputClass}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            aria-invalid={state.fieldErrors?.confirmPassword ? true : undefined}
            required
          />
          <FieldError messages={state.fieldErrors?.confirmPassword} />
        </label>
      ) : null}

      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`rounded-lg px-3 py-2.5 text-sm ${
            state.status === "error"
              ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <button
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={pending}
      >
        {pending ? "Please wait…" : submitLabel}
      </button>

      {showForgotPassword ? (
        <div className="text-right">
          <Link
            href="/auth/forgot-password"
            className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Forgot password?
          </Link>
        </div>
      ) : null}
    </form>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  return messages?.[0] ? (
    <span className="mt-1 block text-sm text-red-600 dark:text-red-400">
      {messages[0]}
    </span>
  ) : null;
}
