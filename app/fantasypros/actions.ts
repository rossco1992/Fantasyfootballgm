"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { refreshFantasyProsData } from "@/services/fantasypros-refresh";
import { retrieveLeagueConfiguration } from "@/services/league-configurations";
import { generateProjectionConsensus } from "@/services/projection-consensus";

export async function refreshFantasyProsAction(
  formData: FormData,
): Promise<never> {
  const user = await requireAuthenticatedUser();
  const season = Number(formData.get("season"));
  let outcome: Awaited<ReturnType<typeof refreshFantasyProsData>>;
  try {
    outcome = await refreshFantasyProsData({
      season,
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
  const league = await retrieveLeagueConfiguration(user.id);
  if (league) {
    try {
      await generateProjectionConsensus({
        leagueId: league.id,
        userId: user.id,
        season,
        week: null,
        horizon: "preseason",
      });
    } catch {
      // Rankings remain usable when the provider omits projection records.
    }
  }
  revalidatePath("/dashboard");
  redirect(
    `/dashboard?message=${encodeURIComponent(
      `FantasyPros refreshed · ${outcome.playerIdentitiesImported} players · ${outcome.recordsImported} data records`,
    )}`,
  );
}
