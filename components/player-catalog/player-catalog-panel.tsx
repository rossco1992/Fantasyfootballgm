"use client";

import { useActionState } from "react";

import { refreshPlayerCatalogAction } from "@/app/player-catalog/actions";
import { INITIAL_PLAYER_CATALOG_FORM_STATE } from "@/app/player-catalog/form-state";

export type PlayerCatalogPanelProps = {
  playerCount: number;
  lastSuccessAt: string | null;
  status: "not_loaded" | "current" | "stale" | "failed";
};

function statusLabel(status: PlayerCatalogPanelProps["status"]): string {
  switch (status) {
    case "current":
      return "Current";
    case "stale":
      return "Refresh recommended";
    case "failed":
      return "Refresh failed";
    default:
      return "Not loaded";
  }
}

export function PlayerCatalogPanel({
  playerCount,
  lastSuccessAt,
  status,
}: PlayerCatalogPanelProps) {
  const [state, formAction, pending] = useActionState(
    refreshPlayerCatalogAction,
    INITIAL_PLAYER_CATALOG_FORM_STATE,
  );

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            Player data
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">
            NFL player pool
          </h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            {playerCount.toLocaleString()} draftable players ·{" "}
            {statusLabel(status)}
          </p>
          {lastSuccessAt ? (
            <p className="mt-1 text-xs text-neutral-500">
              Last refreshed {new Date(lastSuccessAt).toLocaleString()}
            </p>
          ) : null}
        </div>

        <form action={formAction}>
          <button
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending ? "Refreshing…" : "Refresh player data"}
          </button>
        </form>
      </div>

      {state.message ? (
        <p
          className={`mt-4 rounded-lg px-4 py-3 text-sm ${
            state.status === "error"
              ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          }`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
