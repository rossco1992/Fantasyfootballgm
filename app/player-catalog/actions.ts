"use server";

import { revalidatePath } from "next/cache";

import type { PlayerCatalogFormState } from "@/app/player-catalog/form-state";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  currentNFLSeason,
  refreshSleeperPlayerCatalog,
} from "@/services/player-catalog";

export async function refreshPlayerCatalogAction(
  _previousState: PlayerCatalogFormState,
): Promise<PlayerCatalogFormState> {
  void _previousState;
  await requireAuthenticatedUser();

  try {
    const result = await refreshSleeperPlayerCatalog(currentNFLSeason());
    if (result.kind === "refreshed" && result.outcome.status === "failed") {
      return {
        status: "error",
        message:
          "Player refresh failed. The last valid player pool is still available.",
      };
    }

    revalidatePath("/dashboard");
    return {
      status: "success",
      message:
        result.kind === "skipped"
          ? "Player data is already current."
          : `Player data refreshed: ${result.outcome.playerIdentitiesImported.toLocaleString()} records imported.`,
    };
  } catch {
    return {
      status: "error",
      message:
        "Player refresh could not be completed. The last valid player pool is still available.",
    };
  }
}
