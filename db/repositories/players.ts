import { query } from "@/db/client";
import {
  type Player,
  type PlayerExternalId,
  type PlayerProjection,
  playerExternalIdSchema,
  playerProjectionSchema,
  playerSchema,
} from "@/db/types";
import {
  type CanonicalPlayer,
  type CanonicalPlayerInput,
  type DraftablePlayerQuery,
  canonicalPlayerInputSchema,
  canonicalPlayerSchema,
  draftablePlayerQuerySchema,
  playerExternalIdentitySchema,
} from "@/domain/player";

/**
 * Data access for canonical players and their raw projections. All SQL for
 * these entities lives here so the rest of the app depends on typed functions,
 * not queries (ADR-004).
 */

const PLAYER_COLUMNS = `id, full_name, position, nfl_team, bye_week, status,
  created_at, updated_at`;
const QUALIFIED_PLAYER_COLUMNS = `p.id, p.full_name, p.position, p.nfl_team,
  p.bye_week, p.status, p.created_at, p.updated_at`;
const LATEST_CATALOG_MEMBERSHIP_SQL = `exists (
  select 1
    from provider_player_identity_records identity_record
    join provider_ingestion_state ingestion_state
      on ingestion_state.latest_snapshot_id = identity_record.snapshot_id
    join providers catalog_provider
      on catalog_provider.id = ingestion_state.provider_id
   where identity_record.player_id = players.id
     and (
       catalog_provider.slug = 'fantasypros'
       or catalog_provider.slug like 'fantasypros-csv%'
       or catalog_provider.slug like 'fantasynerds-csv%'
     )
)`;

function mapPlayer(row: Player): CanonicalPlayer {
  return canonicalPlayerSchema.parse({
    id: row.id,
    fullName: row.full_name,
    position: row.position,
    nflTeam: row.nfl_team,
    byeWeek: row.bye_week,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function listPlayers(): Promise<CanonicalPlayer[]> {
  const result = await query<Player>(
    `select ${PLAYER_COLUMNS}
       from players
      order by full_name`,
  );
  return result.rows.map((row) => mapPlayer(playerSchema.parse(row)));
}

export async function countDraftablePlayers(): Promise<number> {
  const result = await query<{ count: number }>(
    `select count(*)::int as count
       from players
      where status not in ('inactive', 'retired')
        and ${LATEST_CATALOG_MEMBERSHIP_SQL}`,
  );
  return result.rows[0]?.count ?? 0;
}

export async function searchDraftablePlayers(
  input: DraftablePlayerQuery = {},
): Promise<CanonicalPlayer[]> {
  const filters = draftablePlayerQuerySchema.parse(input);
  const result = await query<Player>(
    `select ${PLAYER_COLUMNS}
       from players
      where status not in ('inactive', 'retired')
        and ${LATEST_CATALOG_MEMBERSHIP_SQL}
        and ($1::text = '' or full_name ilike '%' || $1 || '%')
        and ($2::text is null or position = $2)
      order by
        case position
          when 'QB' then 1
          when 'RB' then 2
          when 'WR' then 3
          when 'TE' then 4
          when 'K' then 5
          when 'DST' then 6
        end,
        full_name
      limit $3`,
    [filters.search, filters.position, filters.limit],
  );
  return result.rows.map((row) => mapPlayer(playerSchema.parse(row)));
}

export async function getPlayerById(
  id: string,
): Promise<CanonicalPlayer | null> {
  const result = await query<Player>(
    `select ${PLAYER_COLUMNS}
       from players
      where id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapPlayer(playerSchema.parse(row)) : null;
}

export async function getPlayerByExternalId(
  providerSlug: string,
  externalId: string,
): Promise<CanonicalPlayer | null> {
  const result = await query<Player>(
    `select ${QUALIFIED_PLAYER_COLUMNS}
       from player_external_ids x
       join providers pr on pr.id = x.provider_id
       join players p on p.id = x.player_id
      where pr.slug = $1 and x.external_id = $2`,
    [providerSlug, externalId],
  );
  const row = result.rows[0];
  return row ? mapPlayer(playerSchema.parse(row)) : null;
}

export async function createPlayer(
  input: CanonicalPlayerInput,
): Promise<CanonicalPlayer> {
  const player = canonicalPlayerInputSchema.parse(input);
  const result = await query<Player>(
    `insert into players (full_name, position, nfl_team, bye_week, status)
     values ($1, $2, $3, $4, $5)
     returning ${PLAYER_COLUMNS}`,
    [
      player.fullName,
      player.position,
      player.nflTeam,
      player.byeWeek,
      player.status,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("The canonical player was not created.");
  return mapPlayer(playerSchema.parse(row));
}

export async function updatePlayer(
  id: string,
  input: CanonicalPlayerInput,
): Promise<CanonicalPlayer | null> {
  const player = canonicalPlayerInputSchema.parse(input);
  const result = await query<Player>(
    `update players
        set full_name = $2,
            position = $3,
            nfl_team = $4,
            bye_week = $5,
            status = $6,
            updated_at = now()
      where id = $1
      returning ${PLAYER_COLUMNS}`,
    [
      id,
      player.fullName,
      player.position,
      player.nflTeam,
      player.byeWeek,
      player.status,
    ],
  );
  const row = result.rows[0];
  return row ? mapPlayer(playerSchema.parse(row)) : null;
}

export async function listExternalIdsForPlayer(
  playerId: string,
): Promise<PlayerExternalId[]> {
  const result = await query<PlayerExternalId>(
    `select id, player_id, provider_id, external_id, created_at
       from player_external_ids
      where player_id = $1
      order by provider_id, external_id`,
    [playerId],
  );
  return result.rows.map((row) => playerExternalIdSchema.parse(row));
}

export async function addPlayerExternalId(
  playerId: string,
  providerId: string,
  externalId: string,
): Promise<PlayerExternalId> {
  const identity = playerExternalIdentitySchema.parse({
    providerId,
    externalId,
  });
  const result = await query<PlayerExternalId>(
    `insert into player_external_ids (player_id, provider_id, external_id)
     values ($1, $2, $3)
     returning id, player_id, provider_id, external_id, created_at`,
    [playerId, identity.providerId, identity.externalId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("The player external ID was not created.");
  return playerExternalIdSchema.parse(row);
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
