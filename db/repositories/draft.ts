import { query } from "@/db/client";
import {
  type DraftPick,
  type DraftPlayer,
  type DraftQueueEntry,
  type DraftSession,
  draftPickSchema,
  draftPlayerSchema,
  draftQueueEntrySchema,
  draftSessionSchema,
} from "@/domain/draft";

type DraftSessionRow = {
  id: string;
  league_id: string;
  season: number;
  status: "active" | "completed";
  team_names: Record<string, string>;
  created_at: Date;
  updated_at: Date;
};

type DraftPlayerRow = {
  id: string;
  full_name: string;
  position: string;
  nfl_team: string | null;
  bye_week: number | null;
  status: string;
  created_at: Date;
  updated_at: Date;
  yahoo_rank: number | null;
  yahoo_adp: number | null;
};

type DraftPickRow = {
  id: string;
  session_id: string;
  player_id: string;
  full_name: string;
  position: string;
  nfl_team: string | null;
  overall_pick: number;
  round: number;
  pick_in_round: number;
  fantasy_team_slot: number;
  created_at: Date;
};

type DraftQueueRow = DraftPlayerRow & {
  queue_id: string;
  queue_order: number;
};

function mapSession(row: DraftSessionRow): DraftSession {
  return draftSessionSchema.parse({
    id: row.id,
    leagueId: row.league_id,
    season: row.season,
    status: row.status,
    teamNames: row.team_names,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapPlayer(row: DraftPlayerRow): DraftPlayer {
  return draftPlayerSchema.parse({
    id: row.id,
    fullName: row.full_name,
    position: row.position,
    nflTeam: row.nfl_team,
    byeWeek: row.bye_week,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    yahooRank: row.yahoo_rank === null ? null : Number(row.yahoo_rank),
    yahooAdp: row.yahoo_adp === null ? null : Number(row.yahoo_adp),
  });
}

function mapPick(row: DraftPickRow): DraftPick {
  return draftPickSchema.parse({
    id: row.id,
    sessionId: row.session_id,
    playerId: row.player_id,
    fullName: row.full_name,
    position: row.position,
    nflTeam: row.nfl_team,
    overallPick: row.overall_pick,
    round: row.round,
    pickInRound: row.pick_in_round,
    fantasyTeamSlot: row.fantasy_team_slot,
    createdAt: row.created_at,
  });
}

export async function getDraftSessionForLeague(
  userId: string,
  leagueId: string,
): Promise<DraftSession | null> {
  const result = await query<DraftSessionRow>(
    `select session.id, session.league_id, session.season, session.status,
            session.team_names,
            session.created_at, session.updated_at
       from draft_sessions session
       join league_configurations league on league.id = session.league_id
      where session.league_id = $1 and league.user_id = $2`,
    [leagueId, userId],
  );
  return result.rows[0] ? mapSession(result.rows[0]) : null;
}

export async function upsertDraftSession(
  userId: string,
  leagueId: string,
  season: number,
): Promise<DraftSession> {
  const result = await query<DraftSessionRow>(
    `insert into draft_sessions (league_id, season)
     select id, $3 from league_configurations where id = $1 and user_id = $2
     on conflict (league_id) do update set
       season = excluded.season,
       updated_at = now()
     returning id, league_id, season, status, team_names, created_at, updated_at`,
    [leagueId, userId, season],
  );
  const row = result.rows[0];
  if (!row) throw new Error("The draft session could not be created.");
  return mapSession(row);
}

export async function updateDraftTeamNames(
  userId: string,
  leagueId: string,
  teamNames: Record<string, string>,
): Promise<void> {
  const result = await query(
    `update draft_sessions session
        set team_names = $3::jsonb,
            updated_at = now()
       from league_configurations league
      where session.league_id = $1
        and league.id = session.league_id
        and league.user_id = $2`,
    [leagueId, userId, JSON.stringify(teamNames)],
  );
  if (result.rowCount === 0) {
    throw new Error("The draft session could not be updated.");
  }
}

/** Latest user-uploaded Yahoo catalog with its ranking signals. */
export async function listYahooDraftPlayers(): Promise<DraftPlayer[]> {
  const result = await query<DraftPlayerRow>(
    `with latest_yahoo_players as (
       select distinct on (identity.player_id)
              identity.player_id,
              snapshot.id as snapshot_id,
              snapshot.observed_at
         from provider_player_identity_records identity
         join provider_data_snapshots snapshot on snapshot.id = identity.snapshot_id
         join provider_ingestion_state state on state.latest_snapshot_id = snapshot.id
         join providers provider on provider.id = state.provider_id
        where provider.slug like 'yahoo-csv%'
        order by identity.player_id, snapshot.observed_at desc, snapshot.imported_at desc
     )
     select player.id, player.full_name, player.position, player.nfl_team,
            player.bye_week, player.status, player.created_at, player.updated_at,
            ranking.yahoo_rank, adp.yahoo_adp
       from latest_yahoo_players yahoo
       join players player on player.id = yahoo.player_id
       left join lateral (
         select (record.normalized_payload->>'rank')::numeric as yahoo_rank
           from provider_data_records record
          where record.snapshot_id = yahoo.snapshot_id
            and record.player_id = yahoo.player_id
            and record.data_type = 'ranking'
          order by record.created_at desc limit 1
       ) ranking on true
       left join lateral (
         select (record.normalized_payload->>'overall')::numeric as yahoo_adp
           from provider_data_records record
          where record.snapshot_id = yahoo.snapshot_id
            and record.player_id = yahoo.player_id
            and record.data_type = 'adp'
          order by record.created_at desc limit 1
       ) adp on true
      where player.status not in ('inactive', 'retired')
      order by coalesce(ranking.yahoo_rank, adp.yahoo_adp, 99999), player.full_name`,
  );
  return result.rows.map(mapPlayer);
}

export async function listDraftPicks(sessionId: string): Promise<DraftPick[]> {
  const result = await query<DraftPickRow>(
    `select pick.id, pick.session_id, pick.player_id, player.full_name,
            player.position, player.nfl_team, pick.overall_pick, pick.round,
            pick.pick_in_round, pick.fantasy_team_slot, pick.created_at
       from draft_picks pick
       join players player on player.id = pick.player_id
      where pick.session_id = $1
      order by pick.overall_pick`,
    [sessionId],
  );
  return result.rows.map(mapPick);
}

export async function insertDraftPick(
  sessionId: string,
  playerId: string,
  coordinates: {
    overallPick: number;
    round: number;
    pickInRound: number;
    fantasyTeamSlot: number;
  },
): Promise<void> {
  await query(
    `insert into draft_picks
      (session_id, player_id, overall_pick, round, pick_in_round, fantasy_team_slot)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      sessionId,
      playerId,
      coordinates.overallPick,
      coordinates.round,
      coordinates.pickInRound,
      coordinates.fantasyTeamSlot,
    ],
  );
  await query(
    `delete from draft_queue_entries where session_id = $1 and player_id = $2`,
    [sessionId, playerId],
  );
}

export async function deleteLastDraftPick(sessionId: string): Promise<void> {
  await query(
    `delete from draft_picks
      where id = (
        select id from draft_picks where session_id = $1
        order by overall_pick desc limit 1
      )`,
    [sessionId],
  );
}

export async function deleteAllDraftPicks(sessionId: string): Promise<void> {
  await query(`delete from draft_picks where session_id = $1`, [sessionId]);
}

export async function listDraftQueue(
  sessionId: string,
): Promise<DraftQueueEntry[]> {
  const result = await query<DraftQueueRow>(
    `select queue.id as queue_id, queue.queue_order, player.id,
            player.full_name, player.position, player.nfl_team, player.bye_week,
            player.status, player.created_at, player.updated_at,
            ranking.yahoo_rank, adp.yahoo_adp
       from draft_queue_entries queue
       join players player on player.id = queue.player_id
       left join lateral (
         select (record.normalized_payload->>'rank')::numeric as yahoo_rank
           from provider_data_records record
           join provider_data_snapshots snapshot on snapshot.id = record.snapshot_id
           join providers provider on provider.id = snapshot.provider_id
          where record.player_id = player.id and record.data_type = 'ranking'
            and provider.slug like 'yahoo-csv%'
          order by record.created_at desc limit 1
       ) ranking on true
       left join lateral (
         select (record.normalized_payload->>'overall')::numeric as yahoo_adp
           from provider_data_records record
           join provider_data_snapshots snapshot on snapshot.id = record.snapshot_id
           join providers provider on provider.id = snapshot.provider_id
          where record.player_id = player.id and record.data_type = 'adp'
            and provider.slug like 'yahoo-csv%'
          order by record.created_at desc limit 1
       ) adp on true
      where queue.session_id = $1
      order by queue.queue_order`,
    [sessionId],
  );
  return result.rows.map((row) =>
    draftQueueEntrySchema.parse({
      ...mapPlayer(row),
      queueEntryId: row.queue_id,
      queueOrder: row.queue_order,
    }),
  );
}

export async function addDraftQueueEntry(
  sessionId: string,
  playerId: string,
): Promise<void> {
  await query(
    `insert into draft_queue_entries (session_id, player_id, queue_order)
     select $1, $2, coalesce(max(queue_order), 0) + 1
       from draft_queue_entries where session_id = $1
     on conflict (session_id, player_id) do nothing`,
    [sessionId, playerId],
  );
}

export async function removeDraftQueueEntry(
  sessionId: string,
  playerId: string,
): Promise<void> {
  await query(
    `delete from draft_queue_entries where session_id = $1 and player_id = $2`,
    [sessionId, playerId],
  );
}
