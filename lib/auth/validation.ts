import { z } from "zod";

const email = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .email("Enter a valid email address.");

const password = z.string().min(8, "Password must be at least 8 characters.");

export const credentialsSchema = z.object({ email, password });

export const emailSchema = z.object({ email });

export const passwordUpdateSchema = z
  .object({
    password,
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
