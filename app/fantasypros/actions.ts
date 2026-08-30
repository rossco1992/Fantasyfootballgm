"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { refreshFantasyProsData } from "@/services/fantasypros-refresh";

export async function refreshFantasyProsAction(
  formData: FormData,
): Promise<never> {
  await requireAuthenticatedUser();
  let outcome: Awaited<ReturnType<typeof refreshFantasyProsData>>;
  try {
    outcome = await refreshFantasyProsData({
      season: formData.get("season"),
      week: null,
      scoring: String(formData.get("scoring") ?? "ppr"),
    });
  } catch {
    redirect(
      `/dashboard?error=${encodeURIComponent(
        "FantasyPros could not be refreshed. Verify the Vercel API key and try again.",
      )}`,
    );
  }
  if (outcome.status === "failed") {
    redirect(
      `/dashboard?error=${encodeURIComponent(
        "FantasyPros could not be refreshed. Verify the Vercel API key and try again.",
      )}`,
    );
  }
  revalidatePath("/dashboard");
  redirect(
    `/dashboard?message=${encodeURIComponent(
      `FantasyPros refreshed · ${outcome.playerIdentitiesImported} players · ${outcome.recordsImported} data records`,
    )}`,
  );
}
