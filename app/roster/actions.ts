"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { RosterFormState } from "@/app/roster/form-state";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { manualRosterPlayerInputSchema } from "@/domain/roster";
import {
  addManualRosterPlayer,
  removeManualRosterPlayer,
  RosterSetupError,
} from "@/services/roster-setup";

function nullableNumber(formData: FormData, name: string): number | null {
  const value = String(formData.get(name) ?? "").trim();
  return value ? Number(value) : null;
}

export async function addRosterPlayerAction(
  _previousState: RosterFormState,
  formData: FormData,
): Promise<RosterFormState> {
  const parsed = manualRosterPlayerInputSchema.safeParse({
    fullName: formData.get("fullName"),
    position: formData.get("position"),
    nflTeam:
      String(formData.get("nflTeam") ?? "")
        .trim()
        .toUpperCase() || null,
    fantasyTeamName: formData.get("fantasyTeamName"),
    acquisitionType: formData.get("acquisitionType"),
    isKeeper: formData.get("isKeeper") === "on",
    originalDraftRound: nullableNumber(formData, "originalDraftRound"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Correct the highlighted roster details.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireAuthenticatedUser();
  try {
    await addManualRosterPlayer(
      user.id,
      String(formData.get("leagueId") ?? ""),
      parsed.data,
    );
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof RosterSetupError
          ? error.message
          : "The roster player could not be saved. Try again.",
    };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?message=Roster%20player%20saved.");
}

export async function removeRosterPlayerAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await removeManualRosterPlayer(
    user.id,
    String(formData.get("assignmentId") ?? ""),
  );
  revalidatePath("/dashboard");
  redirect("/dashboard?message=Roster%20player%20removed.");
}
