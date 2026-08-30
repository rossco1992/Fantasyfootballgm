import Link from "next/link";

import {
  queueDraftPlayerAction,
  recordDraftPickAction,
  undoDraftPickAction,
  unqueueDraftPlayerAction,
  uploadYahooPlayersAction,
} from "@/app/draft/actions";
import { DraftUploadForm } from "@/components/draft/draft-upload-form";
import type { DraftPick, DraftPlayer } from "@/domain/draft";
import type { DraftRoom } from "@/services/draft";

const positionColors: Record<string, string> = {
  QB: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  RB: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  WR: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  TE: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  K: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  DST: "bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100",
};

function PlayerMeta({ player }: { player: DraftPlayer }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-bold ${positionColors[player.position] ?? positionColors.DST}`}
        >
          {player.position}
        </span>
        <p className="truncate font-semibold">{player.fullName}</p>
      </div>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {player.nflTeam ?? "FA"}
        {player.byeWeek ? ` · Bye ${player.byeWeek}` : ""}
        {player.yahooAdp ? ` · ADP ${player.yahooAdp}` : ""}
      </p>
    </div>
  );
}

function DraftButton({
  leagueId,
  playerId,
  returnTab,
}: {
  leagueId: string;
  playerId: string;
  returnTab: string;
}) {
  return (
    <form action={recordDraftPickAction}>
      <input name="leagueId" type="hidden" value={leagueId} />
      <input name="playerId" type="hidden" value={playerId} />
      <input name="returnTab" type="hidden" value={returnTab} />
      <button
        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
        type="submit"
      >
        Draft
      </button>
    </form>
  );
}

function Board({ room }: { room: DraftRoom }) {
  const totalRounds = Object.values(room.league.rosterSlots).reduce(
    (sum, count) => sum + count,
    0,
  );
  const picks = new Map(
    room.picks.map((pick) => [`${pick.round}:${pick.fantasyTeamSlot}`, pick]),
  );
  const current = room.picks.length + 1;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 p-5 dark:border-neutral-800">
        <div>
          <p className="text-xs font-semibold tracking-widest text-emerald-600 uppercase dark:text-emerald-400">
            Live draft board
          </p>
          <h2 className="mt-1 text-xl font-bold">Pick {current}</h2>
        </div>
        {room.picks.length ? (
          <form action={undoDraftPickAction}>
            <input name="leagueId" type="hidden" value={room.league.id} />
            <button
              className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
              type="submit"
            >
              Undo last pick
            </button>
          </form>
        ) : null}
      </div>
      <div className="max-h-[32rem] overflow-auto">
        <div
          className="grid min-w-max"
          style={{
            gridTemplateColumns: `3rem repeat(${room.league.teamCount}, minmax(8rem, 1fr))`,
          }}
        >
          <div className="sticky top-0 left-0 z-20 border-r border-b border-neutral-200 bg-neutral-100 p-2 text-xs font-semibold dark:border-neutral-800 dark:bg-neutral-900">
            Rd
          </div>
          {Array.from({ length: room.league.teamCount }, (_, index) => {
            const slot = index + 1;
            const mine = slot === room.league.draftPosition;
            return (
              <div
                className={`sticky top-0 z-10 border-r border-b border-neutral-200 p-2 text-center text-xs font-semibold dark:border-neutral-800 ${mine ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "bg-neutral-100 dark:bg-neutral-900"}`}
                key={slot}
              >
                {mine ? "My Team" : `Team ${slot}`}
              </div>
            );
          })}
          {Array.from({ length: totalRounds }, (_, roundIndex) => {
            const round = roundIndex + 1;
            return [
              <div
                className="sticky left-0 z-10 border-r border-b border-neutral-200 bg-neutral-100 p-2 text-center text-xs font-bold dark:border-neutral-800 dark:bg-neutral-900"
                key={`round-${round}`}
              >
                {round}
              </div>,
              ...Array.from(
                { length: room.league.teamCount },
                (_, teamIndex) => {
                  const teamSlot = teamIndex + 1;
                  const pick = picks.get(`${round}:${teamSlot}`);
                  const pickInRound =
                    room.league.draftType === "snake" && round % 2 === 0
                      ? room.league.teamCount - teamSlot + 1
                      : teamSlot;
                  const overallPick =
                    (round - 1) * room.league.teamCount + pickInRound;
                  const mine = teamSlot === room.league.draftPosition;
                  return (
                    <div
                      className={`min-h-16 border-r border-b border-neutral-200 p-2 dark:border-neutral-800 ${mine ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}
                      key={`${round}-${teamSlot}`}
                    >
                      <p className="text-[10px] text-neutral-400">
                        {overallPick}
                      </p>
                      {pick ? (
                        <>
                          <p className="mt-1 max-w-28 truncate text-xs font-semibold">
                            {pick.fullName}
                          </p>
                          <p className="text-[10px] text-neutral-500">
                            {pick.position}
                            {pick.nflTeam ? ` · ${pick.nflTeam}` : ""}
                          </p>
                        </>
                      ) : null}
                    </div>
                  );
                },
              ),
            ];
          })}
        </div>
      </div>
    </section>
  );
}

function AvailablePlayers({ room }: { room: DraftRoom }) {
  const queuedIds = new Set(room.queue.map((entry) => entry.id));
  return room.availablePlayers.length ? (
    <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
      {room.availablePlayers.map((player, index) => (
        <div
          className="flex items-center justify-between gap-3 px-4 py-3"
          key={player.id}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="w-7 shrink-0 text-center text-sm font-semibold text-neutral-500">
              {player.yahooRank ?? index + 1}
            </span>
            <PlayerMeta player={player} />
          </div>
          <div className="flex shrink-0 gap-2">
            {!queuedIds.has(player.id) ? (
              <form action={queueDraftPlayerAction}>
                <input name="leagueId" type="hidden" value={room.league.id} />
                <input name="playerId" type="hidden" value={player.id} />
                <button
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                  type="submit"
                >
                  Queue
                </button>
              </form>
            ) : null}
            <DraftButton
              leagueId={room.league.id}
              playerId={player.id}
              returnTab="available"
            />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="p-8 text-center text-sm text-neutral-500">
      No available players remain.
    </p>
  );
}

function Queue({ room }: { room: DraftRoom }) {
  return room.queue.length ? (
    <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
      {room.queue.map((player, index) => (
        <div
          className="flex items-center justify-between gap-3 px-4 py-3"
          key={player.queueEntryId}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="w-7 text-center text-sm font-bold text-emerald-600">
              {index + 1}
            </span>
            <PlayerMeta player={player} />
          </div>
          <div className="flex shrink-0 gap-2">
            <form action={unqueueDraftPlayerAction}>
              <input name="leagueId" type="hidden" value={room.league.id} />
              <input name="playerId" type="hidden" value={player.id} />
              <button
                className="px-2 py-2 text-xs font-semibold text-red-600 dark:text-red-400"
                type="submit"
              >
                Remove
              </button>
            </form>
            <DraftButton
              leagueId={room.league.id}
              playerId={player.id}
              returnTab="queue"
            />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="p-8 text-center text-sm text-neutral-500">
      Your queue is empty. Add players from Available Players.
    </p>
  );
}

function MyRoster({ room }: { room: DraftRoom }) {
  const myPicks = room.picks.filter(
    (pick) => pick.fantasyTeamSlot === room.league.draftPosition,
  );
  return (
    <div className="p-4">
      {myPicks.length ? (
        <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {myPicks.map((pick: DraftPick) => (
            <div className="flex items-center gap-3 py-3" key={pick.id}>
              <span className="w-14 text-xs font-semibold text-neutral-500">
                Rd {pick.round}
              </span>
              <div>
                <p className="font-semibold">{pick.fullName}</p>
                <p className="text-xs text-neutral-500">
                  {pick.position}
                  {pick.nflTeam ? ` · ${pick.nflTeam}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-neutral-500">
          Your drafted players will appear here automatically.
        </p>
      )}
      {room.keepers.length ? (
        <div className="mt-5 border-t border-neutral-200 pt-5 dark:border-neutral-800">
          <p className="text-xs font-bold tracking-wider text-neutral-500 uppercase">
            Keeper context
          </p>
          {room.keepers.map((keeper) => (
            <p className="mt-2 text-sm" key={keeper.id}>
              <span className="font-semibold">{keeper.fullName}</span> ·{" "}
              {keeper.fantasyTeamName} · Round {keeper.keeperCostRound}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DraftRoomView({
  room,
  activeTab,
  message,
  error,
}: {
  room: DraftRoom;
  activeTab: "available" | "queue" | "roster";
  message?: string;
  error?: string;
}) {
  if (!room.session || room.players.length === 0) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-sm font-semibold text-emerald-600">Draft setup</p>
        <h2 className="mt-2 text-2xl font-bold">Upload Yahoo players</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-neutral-300">
          Upload a Yahoo CSV containing player name, position, team, and rank or
          ADP. This creates the available-player pool for your live board.
        </p>
        {error ? (
          <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <DraftUploadForm
          action={uploadYahooPlayersAction}
          leagueId={room.league.id}
          scoring={room.league.scoringPreset}
          season={new Date().getUTCFullYear()}
        />
      </section>
    );
  }

  const tabs = [
    ["available", `Available Players (${room.availablePlayers.length})`],
    ["queue", `Queue (${room.queue.length})`],
    ["roster", "My Roster"],
  ] as const;
  return (
    <div className="space-y-6">
      {message ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <Board room={room} />
      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <nav className="flex overflow-x-auto border-b border-neutral-200 dark:border-neutral-800">
          {tabs.map(([tab, label]) => (
            <Link
              className={`border-b-2 px-5 py-4 text-sm font-semibold whitespace-nowrap ${activeTab === tab ? "border-emerald-600 text-emerald-700 dark:text-emerald-300" : "border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"}`}
              href={`/draft?tab=${tab}`}
              key={tab}
            >
              {label}
            </Link>
          ))}
        </nav>
        {activeTab === "available" ? <AvailablePlayers room={room} /> : null}
        {activeTab === "queue" ? <Queue room={room} /> : null}
        {activeTab === "roster" ? <MyRoster room={room} /> : null}
      </section>
      <details className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <summary className="cursor-pointer text-sm font-semibold">
          Replace Yahoo player file
        </summary>
        <DraftUploadForm
          action={uploadYahooPlayersAction}
          leagueId={room.league.id}
          replacement
          scoring={room.league.scoringPreset}
          season={new Date().getUTCFullYear()}
        />
      </details>
    </div>
  );
}
