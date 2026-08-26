"use client";

import { useActionState, useState } from "react";

import { saveLeagueConfigurationAction } from "@/app/league/actions";
import { INITIAL_LEAGUE_FORM_STATE } from "@/app/league/form-state";
import type { LeagueConfigurationInput } from "@/domain/league-configuration";

const fieldClass =
  "mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:ring-emerald-900";

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{messages[0]}</p>
  );
}

const rosterFields: Array<{
  key: keyof LeagueConfigurationInput["rosterSlots"];
  label: string;
  max: number;
}> = [
  { key: "qb", label: "QB", max: 10 },
  { key: "rb", label: "RB", max: 10 },
  { key: "wr", label: "WR", max: 10 },
  { key: "te", label: "TE", max: 10 },
  { key: "flex", label: "FLEX", max: 10 },
  { key: "superflex", label: "SUPERFLEX", max: 10 },
  { key: "k", label: "K", max: 10 },
  { key: "dst", label: "DST", max: 10 },
  { key: "bench", label: "Bench", max: 20 },
];

export function LeagueConfigurationForm({
  initialConfiguration,
  isEditing,
}: {
  initialConfiguration: LeagueConfigurationInput;
  isEditing: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    saveLeagueConfigurationAction,
    INITIAL_LEAGUE_FORM_STATE,
  );
  const [leagueFormat, setLeagueFormat] = useState(
    initialConfiguration.leagueFormat,
  );

  return (
    <form action={formAction} className="space-y-8">
      {state.message ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.message}
        </p>
      ) : null}

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-4 text-lg font-semibold">League details</legend>

        <label className="sm:col-span-2">
          <span className="text-sm font-medium">League name</span>
          <input
            className={fieldClass}
            defaultValue={initialConfiguration.name}
            maxLength={80}
            name="name"
            required
          />
          <FieldError messages={state.fieldErrors?.name} />
        </label>

        <label>
          <span className="text-sm font-medium">Team count</span>
          <input
            className={fieldClass}
            defaultValue={initialConfiguration.teamCount}
            max={20}
            min={4}
            name="teamCount"
            required
            type="number"
          />
          <FieldError messages={state.fieldErrors?.teamCount} />
        </label>

        <label>
          <span className="text-sm font-medium">League format</span>
          <select
            className={fieldClass}
            name="leagueFormat"
            onChange={(event) =>
              setLeagueFormat(event.target.value as "redraft" | "keeper")
            }
            value={leagueFormat}
          >
            <option value="redraft">Redraft</option>
            <option value="keeper">Keeper</option>
          </select>
          <FieldError messages={state.fieldErrors?.leagueFormat} />
        </label>

        {leagueFormat === "keeper" ? (
          <label>
            <span className="text-sm font-medium">
              Maximum keepers per team
            </span>
            <input
              className={fieldClass}
              defaultValue={initialConfiguration.maxKeepersPerTeam || 1}
              max={40}
              min={1}
              name="maxKeepersPerTeam"
              required
              type="number"
            />
            <FieldError messages={state.fieldErrors?.maxKeepersPerTeam} />
          </label>
        ) : (
          <input name="maxKeepersPerTeam" type="hidden" value="0" />
        )}

        <label>
          <span className="text-sm font-medium">Scoring preset</span>
          <select
            className={fieldClass}
            defaultValue={initialConfiguration.scoringPreset}
            name="scoringPreset"
          >
            <option value="standard">Standard</option>
            <option value="half_ppr">Half-PPR</option>
            <option value="ppr">PPR</option>
          </select>
          <FieldError messages={state.fieldErrors?.scoringPreset} />
        </label>

        <label>
          <span className="text-sm font-medium">Draft type</span>
          <select
            className={fieldClass}
            defaultValue={initialConfiguration.draftType}
            name="draftType"
          >
            <option value="snake">Snake</option>
            <option value="linear">Linear</option>
          </select>
          <FieldError messages={state.fieldErrors?.draftType} />
        </label>

        <label>
          <span className="text-sm font-medium">Your draft position</span>
          <input
            className={fieldClass}
            defaultValue={initialConfiguration.draftPosition}
            min={1}
            name="draftPosition"
            required
            type="number"
          />
          <FieldError messages={state.fieldErrors?.draftPosition} />
        </label>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-semibold">Roster slots</legend>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Set each slot to match your league. Use 0 for positions your league
          does not use.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {rosterFields.map((field) => (
            <label key={field.key}>
              <span className="text-sm font-medium">{field.label}</span>
              <input
                className={fieldClass}
                defaultValue={initialConfiguration.rosterSlots[field.key]}
                max={field.max}
                min={0}
                name={field.key}
                required
                type="number"
              />
            </label>
          ))}
        </div>
        <FieldError messages={state.fieldErrors?.rosterSlots} />
      </fieldset>

      <button
        className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : isEditing ? "Save changes" : "Create league"}
      </button>
    </form>
  );
}
