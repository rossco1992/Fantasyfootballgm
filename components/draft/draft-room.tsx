import Link from "next/link";

import {
  assignDraftKeeperSlotsAction,
  clearDraftBoardAction,
  queueDraftPlayerAction,
  recordDraftPickAction,
  refreshDraftFantasyProsAction,
  renameDraftTeamsAction,
  undoDraftPickAction,
  unqueueDraftPlayerAction,
  uploadYahooPlayersAction,
} from "@/app/draft/actions";
import { ClearDraftButton } from "@/components/draft/clear-draft-button";
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

function RecommendationAction({
  room,
  playerId,
}: {
  room: DraftRoom;
  playerId: string;
}) {
  if (room.assistant?.picksUntilUser === 0) {
    return (
      <DraftButton
        leagueId={room.league.id}
        playerId={playerId}
        returnTab="available"
      />
    );
  }
  if (room.queue.some((entry) => entry.id === playerId)) {
    return (
      <span className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">
        Queued
      </span>
    );
  }
  return (
    <form action={queueDraftPlayerAction}>
      <input name="leagueId" type="hidden" value={room.league.id} />
      <input name="playerId" type="hidden" value={playerId} />
      <button
        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
        type="submit"
      >
        Queue
      </button>
    </form>
  );
}

function RecommendationFactors({
  factors,
}: {
  factors: NonNullable<
    DraftRoom["assistant"]
  >["recommendations"][number]["factors"];
}) {
  const entries = [
    ["Value", factors.projectedValue],
    ["Scarcity", factors.scarcity],
    ["Wait risk", factors.availabilityRisk],
    ["Roster fit", factors.rosterFit],
    ["Confidence", factors.confidence],
  ] as const;
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
      {entries.map(([label, value]) => (
        <div
          className="rounded-lg bg-white/70 px-3 py-2 dark:bg-black/20"
          key={label}
        >
          <p className="text-[10px] font-semibold tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
            {label}
          </p>
          <p className="mt-0.5 text-sm font-bold">{Math.round(value)}</p>
        </div>
      ))}
    </div>
  );
}

function DraftAssistantPanel({ room }: { room: DraftRoom }) {
  const assistant = room.assistant;
  const best = assistant?.recommendations[0];
  if (!assistant || !best) return null;
  const scoringLabel =
    room.league.scoringPreset === "half_ppr"
      ? "Half-PPR"
      : room.league.scoringPreset === "ppr"
        ? "PPR"
        : "standard";
  const dataLabel =
    assistant.dataMode === "projection_consensus"
      ? "FantasyPros projections + Yahoo"
      : assistant.dataMode === "fantasypros_market"
        ? "FantasyPros ECR/ADP + Yahoo"
        : "Yahoo market data only";
  const freshness = room.fantasyProsFreshness;
  const refreshedLabel = freshness?.lastSuccessAt
    ? `Updated ${freshness.lastSuccessAt.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}${freshness.lastStatus === "partial" ? " · partial" : ""}${freshness.isStale ? " · stale" : ""}`
    : "FantasyPros has not been refreshed";

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="border-b border-emerald-200 px-5 py-4 dark:border-emerald-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-widest text-emerald-700 uppercase dark:text-emerald-300">
              Draft assistant
            </p>
            <h2 className="mt-1 text-xl font-bold">
              {assistant.picksUntilUser === 0
                ? `You’re on the clock · Pick ${assistant.currentOverallPick}`
                : `Your next pick: ${assistant.nextUserOverallPick} · ${assistant.picksUntilUser} picks away`}
            </h2>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${assistant.dataMode === "market_only" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"}`}
            >
              {dataLabel}
            </span>
            <form action={refreshDraftFantasyProsAction}>
              <input name="leagueId" type="hidden" value={room.league.id} />
              <input name="season" type="hidden" value={room.session?.season} />
              <input name="returnTab" type="hidden" value="available" />
              <button
                className="rounded-lg border border-emerald-600 bg-white px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-neutral-950 dark:text-emerald-300 dark:hover:bg-emerald-950"
                type="submit"
              >
                Refresh FantasyPros
              </button>
            </form>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {refreshedLabel}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-neutral-500 dark:text-neutral-400">
          Refreshes players · ECR and tiers · ADP · projections · injuries ·
          latest news
        </p>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-emerald-700 uppercase dark:text-emerald-300">
              {assistant.picksUntilUser === 0
                ? "Best pick now"
                : "Current recommendation"}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span
                className={`rounded px-2 py-1 text-xs font-bold ${positionColors[best.position] ?? positionColors.DST}`}
              >
                {best.position}
              </span>
              <h3 className="truncate text-2xl font-bold">{best.fullName}</h3>
              <span className="rounded-full bg-neutral-950 px-2.5 py-1 text-xs font-bold text-white dark:bg-white dark:text-neutral-950">
                {best.score}
              </span>
            </div>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              {best.nflTeam ?? "FA"}
              {best.consensusPoints !== null
                ? ` · ${best.consensusPoints.toFixed(1)} projected ${scoringLabel} points`
                : ""}
              {best.yahooAdp !== null ? ` · ADP ${best.yahooAdp}` : ""}
              {best.fantasyProsRank !== null
                ? ` · FP ECR ${best.fantasyProsRank}`
                : ""}
              {best.fantasyProsTier !== null
                ? ` · Tier ${best.fantasyProsTier}`
                : ""}
            </p>
            <ul className="mt-4 space-y-1 text-sm leading-6 text-neutral-700 dark:text-neutral-200">
              {best.reasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
            {best.warning ? (
              <p className="mt-3 text-sm font-semibold text-amber-700 dark:text-amber-300">
                {best.warning}
              </p>
            ) : null}
            {best.fantasyProsNewsHeadline ? (
              <div className="mt-3 rounded-lg border border-neutral-200 bg-white/70 p-3 text-xs dark:border-neutral-800 dark:bg-black/20">
                <p className="font-semibold">Latest FantasyPros news</p>
                <p className="mt-1 text-neutral-700 dark:text-neutral-300">
                  {best.fantasyProsNewsHeadline}
                  {best.fantasyProsNewsSummary
                    ? ` — ${best.fantasyProsNewsSummary}`
                    : ""}
                </p>
              </div>
            ) : null}
          </div>
          <RecommendationAction playerId={best.playerId} room={room} />
        </div>
        <RecommendationFactors factors={best.factors} />
      </div>

      {assistant.recommendations.length > 1 ? (
        <div className="border-t border-emerald-200 bg-white/50 p-5 dark:border-emerald-900 dark:bg-black/10">
          <p className="text-xs font-bold tracking-wider text-neutral-500 uppercase">
            Alternatives
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {assistant.recommendations.slice(1).map((recommendation) => (
              <div
                className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950"
                key={recommendation.playerId}
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-neutral-500">
                    #{recommendation.rank} · Score {recommendation.score}
                  </p>
                  <p className="mt-1 truncate text-sm font-bold">
                    {recommendation.fullName}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {recommendation.position}
                    {recommendation.yahooAdp !== null
                      ? ` · ADP ${recommendation.yahooAdp}`
                      : ""}
                  </p>
                </div>
                <RecommendationAction
                  playerId={recommendation.playerId}
                  room={room}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {assistant.dataMode === "market_only" ? (
        <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Use Refresh FantasyPros above or upload projection CSVs to unlock
          league-adjusted value, projection confidence, and stronger scarcity
          guidance.
        </p>
      ) : null}
    </section>
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
  const keeperReservations = new Map(
    room.keeperReservations.map((reservation) => [
      `${reservation.keeper.keeperCostRound}:${reservation.fantasyTeamSlot}`,
      reservation,
    ]),
  );
  const teamName = (slot: number) =>
    room.session?.teamNames[String(slot)] ??
    (slot === room.league.draftPosition ? "My Team" : `Team ${slot}`);

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 p-5 dark:border-neutral-800">
        <div>
          <p className="text-xs font-semibold tracking-widest text-emerald-600 uppercase dark:text-emerald-400">
            Live draft board
          </p>
          <h2 className="mt-1 text-xl font-bold">
            {room.currentOverallPick === null
              ? "Draft complete"
              : `Pick ${room.currentOverallPick}`}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <details className="group relative">
            <summary className="cursor-pointer list-none rounded-lg border border-neutral-300 px-3 py-2 text-xs font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">
              Draft settings
            </summary>
            <div className="absolute top-11 right-0 z-30 max-h-[80vh] w-[min(42rem,calc(100vw-3rem))] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-950">
              <form action={renameDraftTeamsAction}>
                <p className="mb-3 text-sm font-bold">Team names</p>
                <input name="leagueId" type="hidden" value={room.league.id} />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: room.league.teamCount }, (_, index) => {
                    const slot = index + 1;
                    return (
                      <label className="grid gap-1 text-xs" key={slot}>
                        <span className="font-semibold text-neutral-500">
                          Slot {slot}
                        </span>
                        <input
                          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                          defaultValue={teamName(slot)}
                          maxLength={40}
                          name={`teamName.${slot}`}
                          required
                        />
                      </label>
                    );
                  })}
                </div>
                <button
                  className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  type="submit"
                >
                  Save team names
                </button>
              </form>
              {room.keepers.length ? (
                <form
                  action={assignDraftKeeperSlotsAction}
                  className="mt-5 border-t border-neutral-200 pt-5 dark:border-neutral-800"
                >
                  <input name="leagueId" type="hidden" value={room.league.id} />
                  <p className="text-sm font-bold">Keeper draft slots</p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    Assign each keeper to a team. Its charged round will be
                    reserved automatically. Slot {room.league.draftPosition} is
                    your team.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {room.keepers.map((keeper) => (
                      <label className="grid gap-1 text-xs" key={keeper.id}>
                        <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                          {keeper.fullName} · Round {keeper.keeperCostRound}
                        </span>
                        <select
                          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                          defaultValue={
                            room.session?.keeperTeamSlots[keeper.id] ?? ""
                          }
                          name={`keeperSlot.${keeper.id}`}
                        >
                          <option value="">Not assigned</option>
                          {Array.from(
                            { length: room.league.teamCount },
                            (_, index) => {
                              const slot = index + 1;
                              return (
                                <option key={slot} value={slot}>
                                  Slot {slot} · {teamName(slot)}
                                  {slot === room.league.draftPosition
                                    ? " (My team)"
                                    : ""}
                                </option>
                              );
                            },
                          )}
                        </select>
                      </label>
                    ))}
                  </div>
                  <button
                    className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    type="submit"
                  >
                    Save keeper slots
                  </button>
                </form>
              ) : null}
            </div>
          </details>
          {room.picks.length ? (
            <>
              <form action={undoDraftPickAction}>
                <input name="leagueId" type="hidden" value={room.league.id} />
                <button
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                  type="submit"
                >
                  Undo last pick
                </button>
              </form>
              <ClearDraftButton
                action={clearDraftBoardAction}
                leagueId={room.league.id}
              />
            </>
          ) : null}
        </div>
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
                {teamName(slot)}
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
                  const keeperReservation = keeperReservations.get(
                    `${round}:${teamSlot}`,
                  );
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
                      ) : keeperReservation ? (
                        <>
                          <p className="mt-1 max-w-28 truncate text-xs font-semibold text-amber-800 dark:text-amber-200">
                            {keeperReservation.keeper.fullName}
                          </p>
                          <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                            {keeperReservation.keeper.position} · Keeper
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
  const myKeepers = room.keeperReservations.filter(
    (reservation) =>
      reservation.fantasyTeamSlot === room.league.draftPosition,
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
      {myKeepers.length ? (
        <div className="mt-5 border-t border-neutral-200 pt-5 dark:border-neutral-800">
          <p className="text-xs font-bold tracking-wider text-neutral-500 uppercase">
            My keepers
          </p>
          {myKeepers.map(({ keeper }) => (
            <p className="mt-2 text-sm" key={keeper.id}>
              <span className="font-semibold">{keeper.fullName}</span> ·{" "}
              {keeper.position} · Round {keeper.keeperCostRound}
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
      <DraftAssistantPanel room={room} />
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
