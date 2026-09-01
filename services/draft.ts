import {
  addDraftQueueEntry,
  deleteAllDraftPicks,
  deleteLastDraftPick,
  getDraftSessionForLeague,
  insertDraftPick,
  listDraftPicks,
  listDraftQueue,
  listYahooDraftPlayers,
  removeDraftQueueEntry,
  updateDraftKeeperTeamSlots,
  updateDraftTeamNames,
  upsertDraftSession,
} from "@/db/repositories/draft";
import {
  type DraftKeeperReservation,
  type DraftPick,
  type DraftPlayer,
  type DraftQueueEntry,
  type DraftSession,
  draftOverallPick,
  draftPickCoordinates,
  nextOpenOverallPick,
} from "@/domain/draft";
import type { DraftAssistantResult } from "@/domain/draft-recommendation";
import type { LeagueConfiguration } from "@/domain/league-configuration";
import type { RosterAssignment } from "@/domain/roster";
import { retrieveLeagueConfigurationById } from "@/services/league-configurations";
import { retrieveManualRoster } from "@/services/roster-setup";
import { loadDraftAssistant } from "@/services/draft-recommendations";
import {
  retrieveProviderFreshness,
  type ProviderFreshness,
} from "@/services/provider-ingestion";

export class DraftRoomError extends Error {}

export type DraftRoom = {
  league: LeagueConfiguration;
  session: DraftSession | null;
  players: DraftPlayer[];
  availablePlayers: DraftPlayer[];
  picks: DraftPick[];
  queue: DraftQueueEntry[];
  keepers: RosterAssignment[];
  keeperReservations: DraftKeeperReservation[];
  currentOverallPick: number | null;
  assistant: DraftAssistantResult | null;
  fantasyProsFreshness: ProviderFreshness | null;
};

function totalDraftRounds(league: LeagueConfiguration): number {
  return Object.values(league.rosterSlots).reduce(
    (total, count) => total + count,
    0,
  );
}

export function draftKeeperReservations(input: {
  league: LeagueConfiguration;
  session: DraftSession;
  keepers: RosterAssignment[];
}): DraftKeeperReservation[] {
  const rounds = totalDraftRounds(input.league);
  return input.keepers.flatMap((keeper) => {
    const fantasyTeamSlot = input.session.keeperTeamSlots[keeper.id];
    const round = keeper.keeperCostRound;
    if (
      fantasyTeamSlot === undefined ||
      fantasyTeamSlot < 1 ||
      fantasyTeamSlot > input.league.teamCount ||
      round === null ||
      round < 1 ||
      round > rounds
    ) {
      return [];
    }
    return [
      {
        keeper,
        fantasyTeamSlot,
        overallPick: draftOverallPick(
          round,
          fantasyTeamSlot,
          input.league.teamCount,
          input.league.draftType,
        ),
      },
    ];
  });
}

async function ownedLeague(
  userId: string,
  leagueId: string,
): Promise<LeagueConfiguration> {
  const league = await retrieveLeagueConfigurationById(leagueId, userId);
  if (!league) throw new DraftRoomError("League not found.");
  return league;
}

export async function loadDraftRoom(
  userId: string,
  leagueId: string,
): Promise<DraftRoom> {
  const league = await ownedLeague(userId, leagueId);
  const session = await getDraftSessionForLeague(userId, leagueId);
  const [players, keepers, fantasyProsFreshness] = await Promise.all([
    listYahooDraftPlayers(session?.playerPoolSnapshotId ?? null),
    retrieveManualRoster(userId, leagueId),
    retrieveProviderFreshness("fantasypros"),
  ]);
  if (!session) {
    return {
      league,
      session: null,
      players,
      availablePlayers: players,
      picks: [],
      queue: [],
      keepers: keepers.filter((assignment) => assignment.isKeeper),
      keeperReservations: [],
      currentOverallPick: null,
      assistant: null,
      fantasyProsFreshness,
    };
  }
  const [picks, queue] = await Promise.all([
    listDraftPicks(session.id),
    listDraftQueue(session.id),
  ]);
  const draftedIds = new Set(picks.map((pick) => pick.playerId));
  const keeperAssignments = keepers.filter((assignment) => assignment.isKeeper);
  const keeperIds = new Set(keeperAssignments.map((keeper) => keeper.playerId));
  const activePlayerIds = new Set(players.map((player) => player.id));
  const availablePlayers = players.filter(
    (player) => !draftedIds.has(player.id) && !keeperIds.has(player.id),
  );
  const keeperReservations = draftKeeperReservations({
    league,
    session,
    keepers: keeperAssignments,
  });
  const currentOverallPick = nextOpenOverallPick(
    [
      ...picks.map((pick) => pick.overallPick),
      ...keeperReservations.map((reservation) => reservation.overallPick),
    ],
    totalDraftRounds(league) * league.teamCount,
  );
  const assistant = await loadDraftAssistant({
    league,
    session,
    availablePlayers,
    picks,
    keeperReservations,
  });
  return {
    league,
    session,
    players,
    availablePlayers,
    picks,
    queue: queue.filter(
      (entry) =>
        activePlayerIds.has(entry.id) &&
        !draftedIds.has(entry.id) &&
        !keeperIds.has(entry.id),
    ),
    keepers: keeperAssignments,
    keeperReservations,
    currentOverallPick,
    assistant,
    fantasyProsFreshness,
  };
}

export async function assignDraftKeeperSlots(
  userId: string,
  leagueId: string,
  rawKeeperTeamSlots: Record<string, number>,
): Promise<void> {
  const league = await ownedLeague(userId, leagueId);
  const session = await getDraftSessionForLeague(userId, leagueId);
  if (!session) throw new DraftRoomError("Start the draft room first.");
  const keepers = (await retrieveManualRoster(userId, leagueId)).filter(
    (assignment) => assignment.isKeeper,
  );
  const keeperById = new Map(keepers.map((keeper) => [keeper.id, keeper]));
  const keeperTeamSlots: Record<string, number> = {};
  const reservedRounds = new Set<string>();
  const keepersPerSlot = new Map<number, number>();
  const totalRounds = totalDraftRounds(league);

  for (const [keeperId, slot] of Object.entries(rawKeeperTeamSlots)) {
    const keeper = keeperById.get(keeperId);
    if (!keeper) throw new DraftRoomError("A selected keeper was not found.");
    if (!Number.isInteger(slot) || slot < 1 || slot > league.teamCount) {
      throw new DraftRoomError("Keeper team slots must be inside the league.");
    }
    if (
      keeper.keeperCostRound === null ||
      keeper.keeperCostRound > totalRounds
    ) {
      throw new DraftRoomError(`${keeper.fullName} needs a valid keeper round.`);
    }
    const roundKey = `${slot}:${keeper.keeperCostRound}`;
    if (reservedRounds.has(roundKey)) {
      throw new DraftRoomError(
        `Team ${slot} already has a keeper assigned to round ${keeper.keeperCostRound}.`,
      );
    }
    const count = (keepersPerSlot.get(slot) ?? 0) + 1;
    if (count > league.maxKeepersPerTeam) {
      throw new DraftRoomError(
        `Team ${slot} exceeds the league's keeper limit.`,
      );
    }
    reservedRounds.add(roundKey);
    keepersPerSlot.set(slot, count);
    keeperTeamSlots[keeperId] = slot;
  }
  await updateDraftKeeperTeamSlots(userId, leagueId, keeperTeamSlots);
}

export async function startDraftRoom(
  userId: string,
  leagueId: string,
  season: number,
  playerPoolSnapshotId: string | null = null,
): Promise<DraftSession> {
  await ownedLeague(userId, leagueId);
  return upsertDraftSession(userId, leagueId, season, playerPoolSnapshotId);
}

export async function renameDraftTeams(
  userId: string,
  leagueId: string,
  rawTeamNames: Record<string, string>,
): Promise<void> {
  const league = await ownedLeague(userId, leagueId);
  const session = await getDraftSessionForLeague(userId, leagueId);
  if (!session) throw new DraftRoomError("Start the draft room first.");

  const teamNames: Record<string, string> = {};
  for (let slot = 1; slot <= league.teamCount; slot += 1) {
    const name = rawTeamNames[String(slot)]?.trim();
    if (!name) throw new DraftRoomError(`Team ${slot} needs a name.`);
    if (name.length > 40) {
      throw new DraftRoomError("Team names must be 40 characters or fewer.");
    }
    teamNames[String(slot)] = name;
  }
  await updateDraftTeamNames(userId, leagueId, teamNames);
}

export async function recordNextDraftPick(input: {
  userId: string;
  leagueId: string;
  playerId: string;
}): Promise<void> {
  const league = await ownedLeague(input.userId, input.leagueId);
  const session = await getDraftSessionForLeague(input.userId, input.leagueId);
  if (!session) throw new DraftRoomError("Upload Yahoo players first.");
  const [players, picks, assignments] = await Promise.all([
    listYahooDraftPlayers(session.playerPoolSnapshotId),
    listDraftPicks(session.id),
    retrieveManualRoster(input.userId, input.leagueId),
  ]);
  if (!players.some((player) => player.id === input.playerId)) {
    throw new DraftRoomError("That player is not in the Yahoo draft pool.");
  }
  if (picks.some((pick) => pick.playerId === input.playerId)) {
    throw new DraftRoomError("That player has already been drafted.");
  }
  const keepers = assignments.filter((assignment) => assignment.isKeeper);
  if (keepers.some((keeper) => keeper.playerId === input.playerId)) {
    throw new DraftRoomError("That player is already assigned as a keeper.");
  }
  const keeperReservations = draftKeeperReservations({
    league,
    session,
    keepers,
  });
  const totalPicks = totalDraftRounds(league) * league.teamCount;
  const nextOverallPick = nextOpenOverallPick(
    [
      ...picks.map((pick) => pick.overallPick),
      ...keeperReservations.map((reservation) => reservation.overallPick),
    ],
    totalPicks,
  );
  if (nextOverallPick === null) {
    throw new DraftRoomError("The draft is complete.");
  }
  const coordinates = draftPickCoordinates(
    nextOverallPick,
    league.teamCount,
    league.draftType,
  );
  await insertDraftPick(session.id, input.playerId, coordinates);
}

export async function undoLastDraftPick(
  userId: string,
  leagueId: string,
): Promise<void> {
  await ownedLeague(userId, leagueId);
  const session = await getDraftSessionForLeague(userId, leagueId);
  if (!session) throw new DraftRoomError("There is no draft to update.");
  await deleteLastDraftPick(session.id);
}

export async function clearDraftBoard(
  userId: string,
  leagueId: string,
): Promise<void> {
  await ownedLeague(userId, leagueId);
  const session = await getDraftSessionForLeague(userId, leagueId);
  if (!session) throw new DraftRoomError("There is no draft to clear.");
  await deleteAllDraftPicks(session.id);
}

export async function queueDraftPlayer(input: {
  userId: string;
  leagueId: string;
  playerId: string;
}): Promise<void> {
  await ownedLeague(input.userId, input.leagueId);
  const session = await getDraftSessionForLeague(input.userId, input.leagueId);
  if (!session) throw new DraftRoomError("Upload Yahoo players first.");
  await addDraftQueueEntry(session.id, input.playerId);
}

export async function unqueueDraftPlayer(input: {
  userId: string;
  leagueId: string;
  playerId: string;
}): Promise<void> {
  await ownedLeague(input.userId, input.leagueId);
  const session = await getDraftSessionForLeague(input.userId, input.leagueId);
  if (!session) return;
  await removeDraftQueueEntry(session.id, input.playerId);
}
