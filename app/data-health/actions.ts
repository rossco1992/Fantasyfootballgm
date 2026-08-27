"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PlayerMatchResolutionError } from "@/db/repositories/data-health";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { applyManualPlayerMatch } from "@/services/data-health";

export async function resolvePlayerMatchAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  try {
    await applyManualPlayerMatch({
      userId: user.id,
      reviewId: String(formData.get("reviewId") ?? ""),
      playerId: String(formData.get("playerId") ?? ""),
    });
  } catch (error) {
    const message =
      error instanceof PlayerMatchResolutionError
        ? error.message
        : "The player match could not be resolved. Try again.";
    redirect(`/dashboard?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?message=Player%20match%20saved.");
}
