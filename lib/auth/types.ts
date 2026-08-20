export type AuthFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<
    Record<"email" | "password" | "confirmPassword", string[]>
  >;
};

export const initialAuthFormState: AuthFormState = { status: "idle" };

export type AuthOutcome =
  | { ok: true; requiresEmailConfirmation?: boolean }
  | { ok: false; message: string };
