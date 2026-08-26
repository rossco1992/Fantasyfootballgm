"use client";

import { useActionState, useState } from "react";

import {
  addRosterPlayerAction,
  removeRosterPlayerAction,
} from "@/app/roster/actions";
import { INITIAL_ROSTER_FORM_STATE } from "@/app/roster/form-state";
import { PLAYER_POSITIONS } from "@/domain/player";
import type { RosterAssignment } from "@/domain/roster";

const fieldClass =
  "mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:ring-emerald-900";

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{messages[0]}</p>
  );
}

export function RosterSetupPanel({
  leagueId,
  assignments,
  keeperLeague,
  maxKeepersPerTeam,
}: {
  leagueId: string;
  assignments: RosterAssignment[];
  keeperLeague: boolean;
  maxKeepersPerTeam: number;
}) {
  const [state, formAction, pending] = useActionState(
    addRosterPlayerAction,
    INITIAL_ROSTER_FORM_STATE,
  );
  const [isKeeper, setIsKeeper] = useState(false);
  const [acquisitionType, setAcquisitionType] = useState("drafted");

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            Step 2
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">
            Add rosters and keepers
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-neutral-300">
            Enter your team first. You can also add other teams&apos; keepers so
            their draft rounds are reserved later.
          </p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
          {assignments.length} player{assignments.length === 1 ? "" : "s"}
        </span>
      </div>

      {assignments.length ? (
        <div className="mt-6 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {assignments.map((assignment) => (
              <div
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                key={assignment.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{assignment.fullName}</p>
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium dark:bg-neutral-800">
                      {assignment.position}
                      {assignment.nflTeam ? ` · ${assignment.nflTeam}` : ""}
                    </span>
                    {assignment.isKeeper ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        Keeper · Round {assignment.keeperCostRound}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {assignment.fantasyTeamName}
                  </p>
                </div>
                <form action={removeRosterPlayerAction}>
                  <input
                    name="assignmentId"
                    type="hidden"
                    value={assignment.id}
                  />
                  <button
                    className="text-sm font-semibold text-red-600 hover:text-red-700 dark:text-red-400"
                    type="submit"
                  >
                    Remove
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 p-5 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
          No players yet. Add the first player from your roster below.
        </div>
      )}

      <form
        action={formAction}
        className="mt-8 border-t border-neutral-200 pt-8 dark:border-neutral-800"
      >
        <input name="leagueId" type="hidden" value={leagueId} />
        {state.message ? (
          <p
            className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
            role="alert"
          >
            {state.message}
          </p>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <label className="sm:col-span-2 lg:col-span-1">
            <span className="text-sm font-medium">Player name</span>
            <input className={fieldClass} name="fullName" required />
            <FieldError messages={state.fieldErrors?.fullName} />
          </label>

          <label>
            <span className="text-sm font-medium">Position</span>
            <select className={fieldClass} name="position">
              {PLAYER_POSITIONS.map((position) => (
                <option key={position} value={position}>
                  {position}
                </option>
              ))}
            </select>
            <FieldError messages={state.fieldErrors?.position} />
          </label>

          <label>
            <span className="text-sm font-medium">NFL team</span>
            <input
              className={fieldClass}
              maxLength={3}
              name="nflTeam"
              placeholder="SF"
            />
            <FieldError messages={state.fieldErrors?.nflTeam} />
          </label>

          <label>
            <span className="text-sm font-medium">Fantasy team</span>
            <input
              className={fieldClass}
              defaultValue="My Team"
              name="fantasyTeamName"
              required
            />
            <FieldError messages={state.fieldErrors?.fantasyTeamName} />
          </label>

          <label>
            <span className="text-sm font-medium">How acquired</span>
            <select
              className={fieldClass}
              name="acquisitionType"
              onChange={(event) => setAcquisitionType(event.target.value)}
              value={acquisitionType}
            >
              <option value="drafted">Drafted</option>
              <option value="waiver">Waiver</option>
              <option value="free_agent">Free agent</option>
              <option value="unknown">Unknown</option>
            </select>
            <FieldError messages={state.fieldErrors?.acquisitionType} />
          </label>

          {keeperLeague ? (
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="mt-1 flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
                <input
                  checked={isKeeper}
                  className="size-4 accent-emerald-600"
                  name="isKeeper"
                  onChange={(event) => setIsKeeper(event.target.checked)}
                  type="checkbox"
                />
                <span className="text-sm font-medium">
                  Keeper ({maxKeepersPerTeam} max per team)
                </span>
              </label>
              <FieldError messages={state.fieldErrors?.isKeeper} />
            </div>
          ) : null}

          {isKeeper && keeperLeague ? (
            <label>
              <span className="text-sm font-medium">
                Prior-year draft round
              </span>
              <input
                className={fieldClass}
                max={40}
                min={1}
                name="originalDraftRound"
                required
                type="number"
              />
              <p className="mt-1 text-xs text-neutral-500">
                This same round becomes the keeper cost.
              </p>
              <FieldError messages={state.fieldErrors?.originalDraftRound} />
            </label>
          ) : (
            <input name="originalDraftRound" type="hidden" value="" />
          )}
        </div>

        {isKeeper && acquisitionType !== "drafted" ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            Your waiver/free-agent keeper cost rule is still unresolved. Save
            this player without keeper status for now.
          </p>
        ) : null}

        <button
          className="mt-6 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving…" : "Add player"}
        </button>
      </form>
    </section>
  );
}
