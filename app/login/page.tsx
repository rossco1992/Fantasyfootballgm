import Link from "next/link";

import { loginAction } from "@/app/auth/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { safeNextPath } from "@/lib/auth/routes";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    message?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to continue to your fantasy football workspace."
      footer={
        <>
          New here?{" "}
          <Link
            href="/register"
            className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Create an account
          </Link>
        </>
      }
    >
      {params.message || params.error ? (
        <p
          role={params.error ? "alert" : "status"}
          className={`mb-5 rounded-lg px-3 py-2.5 text-sm ${
            params.error
              ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          }`}
        >
          {params.error ?? params.message}
        </p>
      ) : null}
      <AuthForm
        action={loginAction}
        submitLabel="Sign in"
        kind="credentials"
        next={safeNextPath(params.next ?? null)}
        showForgotPassword
      />
    </AuthCard>
  );
}
