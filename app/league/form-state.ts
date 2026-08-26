import type { LeagueConfigurationInput } from "@/domain/league-configuration";

export type LeagueFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<keyof LeagueConfigurationInput, string[]>>;
};

export const INITIAL_LEAGUE_FORM_STATE: LeagueFormState = { status: "idle" };
