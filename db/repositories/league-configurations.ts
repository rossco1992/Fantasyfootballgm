import { query } from "@/db/client";
import type {
  LeagueConfiguration,
  LeagueConfigurationInput,
} from "@/domain/league-configuration";
import { leagueConfigurationInputSchema } from "@/domain/league-configuration";

type LeagueConfigurationRow = {
  id: string;
  user_id: string;
  name: string;
  team_count: number;
  draft_type: string;
  draft_position: number;
  scoring_preset: string;
  qb_slots: number;
  rb_slots: number;
  wr_slots: number;
  te_slots: number;
  flex_slots: number;
  superflex_slots: number;
  k_slots: number;
  dst_slots: number;
  bench_slots: number;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS = `id, user_id, name, team_count, draft_type, draft_position,
  scoring_preset, qb_slots, rb_slots, wr_slots, te_slots, flex_slots,
  superflex_slots, k_slots, dst_slots, bench_slots, created_at, updated_at`;

function mapRow(row: LeagueConfigurationRow): LeagueConfiguration {
  const input = leagueConfigurationInputSchema.parse({
    name: row.name,
    teamCount: row.team_count,
    draftType: row.draft_type,
    draftPosition: row.draft_position,
    scoringPreset: row.scoring_preset,
    rosterSlots: {
      qb: row.qb_slots,
      rb: row.rb_slots,
      wr: row.wr_slots,
      te: row.te_slots,
      flex: row.flex_slots,
      superflex: row.superflex_slots,
      k: row.k_slots,
      dst: row.dst_slots,
      bench: row.bench_slots,
    },
  });

  return {
    ...input,
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getLeagueConfigurationForUser(
  userId: string,
): Promise<LeagueConfiguration | null> {
  const result = await query<LeagueConfigurationRow>(
    `select ${COLUMNS} from league_configurations where user_id = $1`,
    [userId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function getLeagueConfigurationByIdForUser(
  id: string,
  userId: string,
): Promise<LeagueConfiguration | null> {
  const result = await query<LeagueConfigurationRow>(
    `select ${COLUMNS}
       from league_configurations
      where id = $1 and user_id = $2`,
    [id, userId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function upsertLeagueConfiguration(
  userId: string,
  configuration: LeagueConfigurationInput,
): Promise<LeagueConfiguration> {
  const slots = configuration.rosterSlots;
  const result = await query<LeagueConfigurationRow>(
    `insert into league_configurations (
       user_id, name, team_count, draft_type, draft_position, scoring_preset,
       qb_slots, rb_slots, wr_slots, te_slots, flex_slots, superflex_slots,
       k_slots, dst_slots, bench_slots
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
     )
     on conflict (user_id) do update set
       name = excluded.name,
       team_count = excluded.team_count,
       draft_type = excluded.draft_type,
       draft_position = excluded.draft_position,
       scoring_preset = excluded.scoring_preset,
       qb_slots = excluded.qb_slots,
       rb_slots = excluded.rb_slots,
       wr_slots = excluded.wr_slots,
       te_slots = excluded.te_slots,
       flex_slots = excluded.flex_slots,
       superflex_slots = excluded.superflex_slots,
       k_slots = excluded.k_slots,
       dst_slots = excluded.dst_slots,
       bench_slots = excluded.bench_slots,
       updated_at = now()
     returning ${COLUMNS}`,
    [
      userId,
      configuration.name,
      configuration.teamCount,
      configuration.draftType,
      configuration.draftPosition,
      configuration.scoringPreset,
      slots.qb,
      slots.rb,
      slots.wr,
      slots.te,
      slots.flex,
      slots.superflex,
      slots.k,
      slots.dst,
      slots.bench,
    ],
  );

  const row = result.rows[0];
  if (!row) throw new Error("The league configuration was not persisted.");
  return mapRow(row);
}
