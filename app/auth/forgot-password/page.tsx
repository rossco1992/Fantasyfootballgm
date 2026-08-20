import Link from "next/link";

import { forgotPasswordAction } from "@/app/auth/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email and we’ll send a secure password-reset link."
      footer={
        <Link
          href="/login"
          className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Return to sign in
        </Link>
      }
    >
      <AuthForm
        action={forgotPasswordAction}
        submitLabel="Send reset link"
        kind="email"
      />
    </AuthCard>
  );
}
