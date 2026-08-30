import {
  addDraftQueueEntry,
  deleteLastDraftPick,
  getDraftSessionForLeague,
  insertDraftPick,
  listDraftPicks,
  listDraftQueue,
  listYahooDraftPlayers,
  removeDraftQueueEntry,
  upsertDraftSession,
} from "@/db/repositories/draft";
import {
  type DraftPick,
  type DraftPlayer,
  type DraftQueueEntry,
  type DraftSession,
  draftPickCoordinates,
} from "@/domain/draft";
import type { LeagueConfiguration } from "@/domain/league-configuration";
import type { RosterAssignment } from "@/domain/roster";
import { retrieveLeagueConfigurationById } from "@/services/league-configurations";
import { retrieveManualRoster } from "@/services/roster-setup";

export class DraftRoomError extends Error {}

export type DraftRoom = {
  league: LeagueConfiguration;
  session: DraftSession | null;
  players: DraftPlayer[];
  availablePlayers: DraftPlayer[];
  picks: DraftPick[];
  queue: DraftQueueEntry[];
  keepers: RosterAssignment[];
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
    listYahooDraftPlayers(),
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
    };
  }
  const [picks, queue] = await Promise.all([
    listDraftPicks(session.id),
    listDraftQueue(session.id),
  ]);
  const draftedIds = new Set(picks.map((pick) => pick.playerId));
  return {
    league,
    session,
    players,
    availablePlayers: players.filter((player) => !draftedIds.has(player.id)),
    picks,
    queue: queue.filter((entry) => !draftedIds.has(entry.id)),
    keepers: keepers.filter((assignment) => assignment.isKeeper),
  };
}

export async function startDraftRoom(
  userId: string,
  leagueId: string,
  season: number,
): Promise<DraftSession> {
  await ownedLeague(userId, leagueId);
  return upsertDraftSession(userId, leagueId, season);
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
    listYahooDraftPlayers(),
    listDraftPicks(session.id),
  ]);
  if (!players.some((player) => player.id === input.playerId)) {
    throw new DraftRoomError("That player is not in the Yahoo draft pool.");
  }
  if (picks.some((pick) => pick.playerId === input.playerId)) {
    throw new DraftRoomError("That player has already been drafted.");
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
