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
  updateDraftTeamNames,
  upsertDraftSession,
} from "@/db/repositories/draft";
import {
  type DraftPick,
  type DraftPlayer,
  type DraftQueueEntry,
  type DraftSession,
  draftPickCoordinates,
} from "@/domain/draft";
import type { DraftAssistantResult } from "@/domain/draft-recommendation";
import type { LeagueConfiguration } from "@/domain/league-configuration";
import type { RosterAssignment } from "@/domain/roster";
import { retrieveLeagueConfigurationById } from "@/services/league-configurations";
import { retrieveManualRoster } from "@/services/roster-setup";
import { loadDraftAssistant } from "@/services/draft-recommendations";

export class DraftRoomError extends Error {}

export type DraftRoom = {
  league: LeagueConfiguration;
  session: DraftSession | null;
  players: DraftPlayer[];
  availablePlayers: DraftPlayer[];
  picks: DraftPick[];
  queue: DraftQueueEntry[];
  keepers: RosterAssignment[];
  assistant: DraftAssistantResult | null;
};

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
  const [players, keepers] = await Promise.all([
    listYahooDraftPlayers(session?.playerPoolSnapshotId ?? null),
    retrieveManualRoster(userId, leagueId),
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
      assistant: null,
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
  const assistant = await loadDraftAssistant({
    league,
    session,
    availablePlayers,
    picks,
    keepers: keeperAssignments,
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
    assistant,
  };
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
  const [players, picks] = await Promise.all([
    listYahooDraftPlayers(session.playerPoolSnapshotId),
    listDraftPicks(session.id),
  ]);
  if (!players.some((player) => player.id === input.playerId)) {
    throw new DraftRoomError("That player is not in the Yahoo draft pool.");
  }
  if (picks.some((pick) => pick.playerId === input.playerId)) {
    throw new DraftRoomError("That player has already been drafted.");
  }
  const rounds = Object.values(league.rosterSlots).reduce(
    (total, count) => total + count,
    0,
  );
  if (picks.length >= rounds * league.teamCount) {
    throw new DraftRoomError("The draft is complete.");
  }
  const coordinates = draftPickCoordinates(
    picks.length + 1,
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
