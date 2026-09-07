"use client";

import { useState } from "react";

type KeeperOption = {
  id: string;
  fullName: string;
  position: string;
  rank: number | null;
};

export function PersonalDraftSettingsForm({
  action,
  leagueId,
  draftPosition,
  teamCount,
  leagueFormat,
  totalRounds,
  keeper,
  players,
  locked,
}: {
  action: (formData: FormData) => Promise<void>;
  leagueId: string;
  draftPosition: number;
  teamCount: number;
  leagueFormat: "redraft" | "keeper";
  totalRounds: number;
  keeper: { playerId: string; round: number | null } | null;
  players: KeeperOption[];
  locked: boolean;
}) {
  const [keeperMode, setKeeperMode] = useState<"none" | "keeper">(
    keeper ? "keeper" : "none",
  );

  return (
    <form action={action}>
      <input name="leagueId" type="hidden" value={leagueId} />
      <p className="text-sm font-bold">My draft setup</p>
      <p className="mt-1 text-xs leading-5 text-neutral-500">
        Choose whether you are keeping a player. A keeper is removed from the
        available list and treated as already on your roster.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1 text-xs">
          <span className="font-semibold text-neutral-500">
            Your draft position
          </span>
          <select
            className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
            defaultValue={draftPosition}
            disabled={locked}
            name="draftPosition"
          >
            {Array.from({ length: teamCount }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                Pick {index + 1}
              </option>
            ))}
          </select>
        </label>
        {leagueFormat === "keeper" ? (
          <label className="grid gap-1 text-xs">
            <span className="font-semibold text-neutral-500">
              Are you keeping a player?
            </span>
            <select
              className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              disabled={locked}
              name="keeperMode"
              onChange={(event) =>
                setKeeperMode(event.currentTarget.value as "none" | "keeper")
              }
              value={keeperMode}
            >
              <option value="none">No keeper</option>
              <option value="keeper">I have a keeper</option>
            </select>
          </label>
        ) : (
          <input name="keeperMode" type="hidden" value="none" />
        )}
        {leagueFormat === "keeper" && keeperMode === "keeper" ? (
          <>
            <label className="grid gap-1 text-xs">
              <span className="font-semibold text-neutral-500">
                Your keeper player
              </span>
              <select
                className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                defaultValue={keeper?.playerId ?? ""}
                disabled={locked}
                name="keeperPlayerId"
                required
              >
                <option value="">Select keeper</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.rank ? `#${player.rank} · ` : ""}
                    {player.fullName} · {player.position}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-semibold text-neutral-500">
                Keeper draft round
              </span>
              <input
                className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                defaultValue={keeper?.round ?? ""}
                disabled={locked}
                max={totalRounds}
                min={1}
                name="keeperRound"
                required
                type="number"
              />
            </label>
          </>
        ) : null}
      </div>
      {locked ? (
        <p className="mt-3 text-xs text-neutral-500">
          Clear the draft board before changing these settings.
        </p>
      ) : null}
      <button
        className="mt-4 min-h-11 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={locked}
        type="submit"
      >
        Save draft setup
      </button>
    </form>
  );
}
