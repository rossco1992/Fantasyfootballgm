import type { ManualRosterPlayerInput } from "@/domain/roster";

export type RosterFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<keyof ManualRosterPlayerInput, string[]>>;
};

export const INITIAL_ROSTER_FORM_STATE: RosterFormState = { status: "idle" };
