import Link from "next/link";

import { registerAction } from "@/app/auth/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Use an email and a password of at least 8 characters."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Sign in
          </Link>
        </>
      }
    >
      <AuthForm
        action={registerAction}
        submitLabel="Create account"
        kind="credentials"
      />
    </AuthCard>
  );
}
