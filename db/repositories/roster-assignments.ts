import { query } from "@/db/client";
import type {
  ManualRosterPlayerInput,
  RosterAssignment,
} from "@/domain/roster";
import { rosterAssignmentSchema } from "@/domain/roster";

type RosterAssignmentRow = {
  id: string;
  league_id: string;
  player_id: string;
  full_name: string;
  position: string;
  nfl_team: string | null;
  player_status: string;
  fantasy_team_name: string;
  acquisition_type: string;
  is_keeper: boolean;
  original_draft_season: number | null;
  original_draft_round: number | null;
  keeper_season: number | null;
  keeper_cost_round: number | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS = `assignment.id, assignment.league_id, assignment.player_id,
  player.full_name, player.position, player.nfl_team,
  player.status as player_status, assignment.fantasy_team_name,
  assignment.acquisition_type, assignment.is_keeper,
  assignment.original_draft_season, assignment.original_draft_round,
  assignment.keeper_season, assignment.keeper_cost_round,
  assignment.created_at, assignment.updated_at`;

function mapRow(row: RosterAssignmentRow): RosterAssignment {
  return rosterAssignmentSchema.parse({
    id: row.id,
    leagueId: row.league_id,
    playerId: row.player_id,
    fullName: row.full_name,
    position: row.position,
    nflTeam: row.nfl_team,
    playerStatus: row.player_status,
    fantasyTeamName: row.fantasy_team_name,
    acquisitionType: row.acquisition_type,
    isKeeper: row.is_keeper,
    originalDraftSeason: row.original_draft_season,
    originalDraftRound: row.original_draft_round,
    keeperSeason: row.keeper_season,
    keeperCostRound: row.keeper_cost_round,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function listRosterAssignmentsForLeague(
  leagueId: string,
  userId: string,
): Promise<RosterAssignment[]> {
  const result = await query<RosterAssignmentRow>(
    `select ${COLUMNS}
       from league_roster_assignments assignment
       join league_configurations league on league.id = assignment.league_id
       join players player on player.id = assignment.player_id
      where assignment.league_id = $1 and league.user_id = $2
      order by assignment.fantasy_team_name, assignment.is_keeper desc,
               player.position, player.full_name`,
    [leagueId, userId],
  );
  return result.rows.map(mapRow);
}

export async function createRosterAssignment(
  leagueId: string,
  userId: string,
  playerId: string,
  input: ManualRosterPlayerInput,
  priorSeason: number,
): Promise<RosterAssignment> {
  const result = await query<RosterAssignmentRow>(
    `with inserted as (
       insert into league_roster_assignments (
         league_id, player_id, fantasy_team_name, acquisition_type, is_keeper,
         original_draft_season, original_draft_round, keeper_season,
         keeper_cost_round
       )
       select league.id, $3, $4, $5, $6,
              case when $6 then $7 else null end,
              case when $6 then $8 else null end,
              case when $6 then $7 + 1 else null end,
              case when $6 then $8 else null end
         from league_configurations league
        where league.id = $1 and league.user_id = $2
       returning *
     )
     select ${COLUMNS}
       from inserted assignment
       join players player on player.id = assignment.player_id`,
    [
      leagueId,
      userId,
      playerId,
      input.fantasyTeamName,
      input.acquisitionType,
      input.isKeeper,
      priorSeason,
      input.originalDraftRound,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("The roster assignment was not persisted.");
  return mapRow(row);
}

export async function deleteRosterAssignment(
  assignmentId: string,
  userId: string,
): Promise<boolean> {
  const result = await query<{ id: string }>(
    `delete from league_roster_assignments assignment
      where assignment.id = $1
        and exists (
          select 1 from league_configurations league
           where league.id = assignment.league_id and league.user_id = $2
        )
      returning assignment.id`,
    [assignmentId, userId],
  );
  return result.rowCount === 1;
}
