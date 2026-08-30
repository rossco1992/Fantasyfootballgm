import type {
  ProviderDescriptor,
  ProviderIngestionRequest,
  ProviderPlayerIdentity,
  ProviderRecordCandidate,
  ProviderSnapshotCandidate,
} from "@/domain/fantasy-data";
import { normalizePlayerName } from "@/domain/player";
import { parseCsv, type CsvRow } from "@/providers/shared/csv";
import {
  normalizeProjectionStats,
  playerPosition,
  playerStatus,
} from "@/providers/shared/normalized-feed";
import type { FantasyDataProviderAdapter } from "@/providers/types";

export const MANUAL_PROJECTION_PROVIDERS = [
  "fantasypros",
  "fantasynerds",
] as const;

export type ManualProjectionProvider =
  (typeof MANUAL_PROJECTION_PROVIDERS)[number];
export type ProjectionScoring = "standard" | "half_ppr" | "ppr";

export type ManualProjectionCsvPayload = {
  csv: string;
  fileName: string;
  observedAt: string;
};

function normalizedRow(row: CsvRow): CsvRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      value.trim(),
    ]),
  );
}

function field(row: CsvRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]?.trim();
    if (value) return value;
  }
  return null;
}

function numeric(row: CsvRow, ...keys: string[]): number | null {
  const value = field(row, ...keys);
  if (value === null) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(row: CsvRow, ...keys: string[]): number | null {
  const value = numeric(row, ...keys);
  return value !== null && Number.isInteger(value) && value > 0 ? value : null;
}

function descriptor(provider: ManualProjectionProvider): ProviderDescriptor {
  return {
    slug: `${provider}-csv`,
    name: provider === "fantasypros" ? "FantasyPros CSV" : "Fantasy Nerds CSV",
    adapterVersion: "1.0.0",
    staleAfterSeconds: 86_400,
  };
}

function providerHome(provider: ManualProjectionProvider): string {
  return provider === "fantasypros"
    ? "https://www.fantasypros.com/"
    : "https://www.fantasynerds.com/";
}

function externalId(
  provider: ManualProjectionProvider,
  row: CsvRow,
): string | null {
  const direct = field(
    row,
    "player_id",
    "playerid",
    provider === "fantasypros" ? "fantasypros_id" : "fantasynerds_id",
  );
  if (direct) return direct;
  const name = field(row, "player_name", "player", "name");
  const position = playerPosition(field(row, "position", "pos"));
  return name && position
    ? `csv:${normalizePlayerName(name).replace(/ /g, "-")}:${position.toLowerCase()}`
    : null;
}

const STAT_KEYS = new Set([
  "passing_attempts",
  "passing_completions",
  "passing_yards",
  "passing_touchdowns",
  "passing_interceptions",
  "rushing_attempts",
  "rushing_yards",
  "rushing_touchdowns",
  "targets",
  "receptions",
  "receiving_yards",
  "receiving_touchdowns",
  "fumbles",
  "field_goals_made",
  "extra_points_made",
]);

function stats(row: CsvRow): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of STAT_KEYS) {
    const value = numeric(row, key);
    if (value !== null) result[key] = value;
  }
  return normalizeProjectionStats(result);
}

function identities(
  provider: ManualProjectionProvider,
  rows: CsvRow[],
): ProviderPlayerIdentity[] {
  const byId = new Map<string, ProviderPlayerIdentity>();
  for (const row of rows) {
    const id = externalId(provider, row);
    const fullName = field(row, "player_name", "player", "name");
    const position = playerPosition(field(row, "position", "pos"));
    if (!id || !fullName || !position || byId.has(id)) continue;
    const rawTeam = field(row, "team", "nfl_team");
    const nflTeam =
      rawTeam && /^[A-Z]{2,3}$/.test(rawTeam.toUpperCase())
        ? rawTeam.toUpperCase()
        : null;
    const sleeperId = field(row, "sleeper_id");
    byId.set(id, {
      externalPlayerId: id,
      fullName,
      position,
      nflTeam,
      byeWeek: positiveInteger(row, "bye", "bye_week"),
      status: playerStatus(field(row, "injury_status", "status")),
      aliases: sleeperId
        ? [
            {
              providerSlug: "sleeper",
              providerName: "Sleeper",
              externalId: sleeperId,
            },
          ]
        : [],
      raw: row,
    });
  }
  return [...byId.values()];
}

function records(
  provider: ManualProjectionProvider,
  rows: CsvRow[],
  scoring: ProjectionScoring,
): ProviderRecordCandidate[] {
  return rows.flatMap((row): ProviderRecordCandidate[] => {
    const id = externalId(provider, row);
    if (!id) return [];
    const result: ProviderRecordCandidate[] = [];
    const rank = numeric(row, "ecr", "rank", "rk", "overall_rank");
    if (rank !== null && rank > 0) {
      result.push({
        recordKey: "ranking",
        externalPlayerId: id,
        normalized: {
          type: "ranking",
          rank,
          positionRank: positiveInteger(row, "position_rank", "pos_rank"),
          tier: positiveInteger(row, "tier"),
          expertCount: positiveInteger(row, "expert_count", "experts"),
        },
        raw: row,
      });
    }
    const adp = numeric(row, "adp", "average_draft_position");
    if (adp !== null && adp > 0) {
      result.push({
        recordKey: "adp",
        externalPlayerId: id,
        normalized: {
          type: "adp",
          overall: adp,
          position: numeric(row, "position_adp", "pos_adp"),
          sampleSize: positiveInteger(row, "sample_size"),
          format: field(row, "format", "scoring") ?? scoring,
        },
        raw: row,
      });
    }
    const projectedPoints = numeric(
      row,
      "projected_points",
      "projection",
      "fpts",
      "fantasy_points",
      "proj_pts",
      scoring === "ppr" ? "proj_pts_ppr" : "proj_pts",
    );
    const projectedStats = stats(row);
    if (projectedPoints !== null || Object.keys(projectedStats).length > 0) {
      result.push({
        recordKey: "projection",
        externalPlayerId: id,
        normalized: {
          type: "projection",
          scoring,
          projectedPoints,
          stats: projectedStats,
        },
        raw: row,
      });
    }
    const injuryStatus = field(row, "injury_status", "game_status");
    const injury = field(row, "injury", "injury_details");
    if (injuryStatus || injury) {
      result.push({
        recordKey: "injury",
        externalPlayerId: id,
        normalized: {
          type: "injury",
          status: playerStatus(injuryStatus),
          practiceStatus: field(row, "practice_status"),
          details: injury,
        },
        raw: row,
      });
    }
    return result;
  });
}

export class ManualProjectionCsvAdapter implements FantasyDataProviderAdapter<ManualProjectionCsvPayload> {
  readonly descriptor: ProviderDescriptor;

  constructor(
    private readonly provider: ManualProjectionProvider,
    private readonly csv: string,
    private readonly fileName: string,
    private readonly observedAt: string,
    private readonly scoring: ProjectionScoring,
  ) {
    this.descriptor = descriptor(provider);
  }

  async fetch(): Promise<ManualProjectionCsvPayload> {
    return {
      csv: this.csv,
      fileName: this.fileName,
      observedAt: this.observedAt,
    };
  }

  normalize(
    payload: ManualProjectionCsvPayload,
    request: ProviderIngestionRequest,
  ): ProviderSnapshotCandidate {
    const rows = parseCsv(payload.csv).map(normalizedRow);
    const normalizedPlayers = identities(this.provider, rows);
    const normalizedRecords = records(this.provider, rows, this.scoring);
    if (normalizedPlayers.length === 0 && normalizedRecords.length === 0) {
      throw new Error("Projection CSV contained no recognized player records.");
    }
    return {
      season: request.season,
      week: request.week,
      observedAt: payload.observedAt,
      provenance: {
        source: this.descriptor.name,
        sourceId: payload.fileName,
        sourceUrl: providerHome(this.provider),
        notes: [
          "User-supplied export; raw rows are retained for attribution and troubleshooting.",
        ],
        coverage: [
          {
            dataset: "manual_csv",
            status: "available",
            recordCount: rows.length,
            sourceUrl: providerHome(this.provider),
            observedAt: payload.observedAt,
            detail: null,
          },
        ],
      },
      players: normalizedPlayers,
      records: normalizedRecords,
      games: [],
    };
  }
}
