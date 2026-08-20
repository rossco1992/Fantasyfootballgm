import { updatePasswordAction } from "@/app/auth/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";

export default function UpdatePasswordPage() {
  return (
    <AuthCard
      title="Choose a new password"
      description="Enter and confirm a new password of at least 8 characters."
    >
      <AuthForm
        action={updatePasswordAction}
        submitLabel="Update password"
        kind="new-password"
      />
    </AuthCard>
  );
}
