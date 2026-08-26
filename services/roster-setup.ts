import {
  createRosterAssignment,
  deleteRosterAssignment,
  listRosterAssignmentsForLeague,
} from "@/db/repositories/roster-assignments";
import { createPlayer, listPlayers } from "@/db/repositories/players";
import type { LeagueConfiguration } from "@/domain/league-configuration";
import { matchPlayerIdentity } from "@/domain/player";
import type {
  ManualRosterPlayerInput,
  RosterAssignment,
} from "@/domain/roster";
import { manualRosterPlayerInputSchema } from "@/domain/roster";
import { retrieveLeagueConfigurationById } from "@/services/league-configurations";

export class RosterSetupError extends Error {}

function rosterSize(configuration: LeagueConfiguration): number {
  return Object.values(configuration.rosterSlots).reduce(
    (total, slots) => total + slots,
    0,
  );
}

export async function retrieveManualRoster(
  userId: string,
  leagueId: string,
): Promise<RosterAssignment[]> {
  return listRosterAssignmentsForLeague(leagueId, userId);
}

export async function addManualRosterPlayer(
  userId: string,
  leagueId: string,
  rawInput: ManualRosterPlayerInput,
  currentSeason = new Date().getFullYear(),
): Promise<RosterAssignment> {
  const input = manualRosterPlayerInputSchema.parse(rawInput);
  const league = await retrieveLeagueConfigurationById(leagueId, userId);
  if (!league)
    throw new RosterSetupError("League configuration was not found.");

  const assignments = await retrieveManualRoster(userId, leagueId);
  const teamAssignments = assignments.filter(
    (assignment) =>
      assignment.fantasyTeamName.toLowerCase() ===
      input.fantasyTeamName.toLowerCase(),
  );
  if (teamAssignments.length >= rosterSize(league)) {
    throw new RosterSetupError(
      `${input.fantasyTeamName} already has the maximum number of roster players.`,
    );
  }

  if (input.isKeeper) {
    if (league.leagueFormat !== "keeper") {
      throw new RosterSetupError("Keepers are not enabled for this league.");
    }
    const keeperCount = teamAssignments.filter(
      (assignment) => assignment.isKeeper,
    ).length;
    if (keeperCount >= league.maxKeepersPerTeam) {
      throw new RosterSetupError(
        `${input.fantasyTeamName} already has the maximum number of keepers.`,
      );
    }
    if (
      teamAssignments.some(
        (assignment) =>
          assignment.isKeeper &&
          assignment.keeperCostRound === input.originalDraftRound,
      )
    ) {
      throw new RosterSetupError(
        `Round ${input.originalDraftRound} is already reserved by another keeper on ${input.fantasyTeamName}.`,
      );
    }
  }

  const players = await listPlayers();
  const match = matchPlayerIdentity(
    {
      fullName: input.fullName,
      position: input.position,
      nflTeam: input.nflTeam,
    },
    players.map((player) => ({ ...player, externalIds: [] })),
  );
  if (match.kind === "ambiguous") {
    throw new RosterSetupError(
      "Multiple canonical players match that name and position. Include the NFL team to continue.",
    );
  }
  const playerId =
    match.kind === "matched"
      ? match.playerId
      : (
          await createPlayer({
            fullName: input.fullName,
            position: input.position,
            nflTeam: input.nflTeam,
            byeWeek: null,
            status: "active",
          })
        ).id;

  try {
    return await createRosterAssignment(
      leagueId,
      userId,
      playerId,
      input,
      currentSeason - 1,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(
        "league_roster_assignments_league_id_player_id_key",
      )
    ) {
      throw new RosterSetupError(
        "That player is already assigned in this league.",
      );
    }
    throw error;
  }
}

export async function removeManualRosterPlayer(
  userId: string,
  assignmentId: string,
): Promise<void> {
  const removed = await deleteRosterAssignment(assignmentId, userId);
  if (!removed) throw new RosterSetupError("Roster player was not found.");
}
