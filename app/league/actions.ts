"use server";

import { redirect } from "next/navigation";

import type { LeagueConfigurationInput } from "@/domain/league-configuration";
import { leagueConfigurationInputSchema } from "@/domain/league-configuration";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { saveLeagueConfiguration } from "@/services/league-configurations";

export type LeagueFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<keyof LeagueConfigurationInput, string[]>>;
};

export const INITIAL_LEAGUE_FORM_STATE: LeagueFormState = { status: "idle" };

function numberValue(formData: FormData, name: string): number {
  return Number(formData.get(name));
}

export async function saveLeagueConfigurationAction(
  _previousState: LeagueFormState,
  formData: FormData,
): Promise<LeagueFormState> {
  const parsed = leagueConfigurationInputSchema.safeParse({
    name: formData.get("name"),
    teamCount: numberValue(formData, "teamCount"),
    draftType: formData.get("draftType"),
    draftPosition: numberValue(formData, "draftPosition"),
    scoringPreset: formData.get("scoringPreset"),
    rosterSlots: {
      qb: numberValue(formData, "qb"),
      rb: numberValue(formData, "rb"),
      wr: numberValue(formData, "wr"),
      te: numberValue(formData, "te"),
      flex: numberValue(formData, "flex"),
      superflex: numberValue(formData, "superflex"),
      k: numberValue(formData, "k"),
      dst: numberValue(formData, "dst"),
      bench: numberValue(formData, "bench"),
    },
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Correct the highlighted league settings.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireAuthenticatedUser();
  try {
    await saveLeagueConfiguration(user.id, parsed.data);
  } catch {
    return {
      status: "error",
      message: "League settings could not be saved. Try again.",
    };
  }

  redirect("/dashboard?message=League%20settings%20saved.");
}
