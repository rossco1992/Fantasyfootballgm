import { query } from "@/db/client";
import {
  type Player,
  type PlayerProjection,
  playerProjectionSchema,
  playerSchema,
} from "@/db/types";

/**
 * Data access for canonical players and their raw projections. All SQL for
 * these entities lives here so the rest of the app depends on typed functions,
 * not queries (ADR-004).
 */

export async function listPlayers(): Promise<Player[]> {
  const result = await query<Player>(
    `select id, full_name, position, nfl_team, created_at, updated_at
       from players
      order by full_name`,
  );
  return result.rows.map((row) => playerSchema.parse(row));
}

export async function getPlayerById(id: string): Promise<Player | null> {
  const result = await query<Player>(
    `select id, full_name, position, nfl_team, created_at, updated_at
       from players
      where id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? playerSchema.parse(row) : null;
}

/**
 * Return the raw projections for a player, newest source first. Raw rows from
 * every source are returned as-is; consensus/derived values are computed
 * elsewhere and never collapse these (ADR-002).
 */
export async function listProjectionsForPlayer(
  playerId: string,
): Promise<PlayerProjection[]> {
  const result = await query<PlayerProjection>(
    `select id, player_id, provider_id, season, week, scoring,
            projected_points, source_timestamp, ingested_at
       from player_projections
      where player_id = $1
      order by source_timestamp desc`,
    [playerId],
  );
  return result.rows.map((row) => playerProjectionSchema.parse(row));
}
