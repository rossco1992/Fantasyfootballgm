import type {
  ProviderDescriptor,
  ProviderGame,
  ProviderIngestionRequest,
  ProviderPlayerIdentity,
  ProviderRecordCandidate,
  ProviderSnapshotCandidate,
  SourceCoverage,
} from "@/domain/fantasy-data";
import type { PlayerPosition, PlayerStatus } from "@/domain/player";
import { parseCsv, type CsvRow } from "@/providers/shared/csv";
import type { FantasyDataProviderAdapter } from "@/providers/types";

export const NFLVERSE_DATASETS = [
  "weekly_rosters",
  "weekly_player_stats",
  "play_by_play_participation",
  "schedules",
] as const;

export type NflverseDatasetName = (typeof NFLVERSE_DATASETS)[number];

type AvailableDataset = {
  status: "available";
  sourceUrl: string;
  observedAt: string;
  rows: CsvRow[];
};

type UnavailableDataset = {
  status: "unavailable";
  sourceUrl: string;
  observedAt: null;
  error: string;
};

export type NflverseDataset = AvailableDataset | UnavailableDataset;

export type NflversePayload = {
  season: number;
  week: number;
  datasets: Record<NflverseDatasetName, NflverseDataset>;
};

export interface NflverseDataClient {
  fetchDataset(
    dataset: NflverseDatasetName,
    sourceUrl: string,
  ): Promise<NflverseDataset>;
}

export const NFLVERSE_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  slug: "nflverse",
  name: "nflverse",
  adapterVersion: "1.0.0",
  staleAfterSeconds: 21_600,
};

export function nflverseSourceUrls(
  season: number,
): Record<NflverseDatasetName, string> {
  const releaseRoot =
    "https://github.com/nflverse/nflverse-data/releases/download";
  return {
    weekly_rosters: `${releaseRoot}/weekly_rosters/roster_weekly_${season}.csv`,
    weekly_player_stats: `${releaseRoot}/stats_player/stats_player_week_${season}.csv`,
    play_by_play_participation: `${releaseRoot}/pbp_participation/pbp_participation_${season}.csv`,
    schedules:
      "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv",
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class HttpNflverseDataClient implements NflverseDataClient {
  private readonly requests = new Map<string, Promise<NflverseDataset>>();

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async fetchDataset(
    dataset: NflverseDatasetName,
    sourceUrl: string,
  ): Promise<NflverseDataset> {
    const key = `${dataset}:${sourceUrl}`;
    const existing = this.requests.get(key);
    if (existing) return existing;
    const request = this.loadDataset(dataset, sourceUrl);
    this.requests.set(key, request);
    return request;
  }

  private async loadDataset(
    dataset: NflverseDatasetName,
    sourceUrl: string,
  ): Promise<NflverseDataset> {
    try {
      const response = await this.fetcher(sourceUrl, {
        headers: { accept: "text/csv" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        throw new Error(`${dataset} returned HTTP ${response.status}.`);
      }
      const lastModified = response.headers.get("last-modified");
      const observedAt = lastModified
        ? new Date(lastModified).toISOString()
        : this.clock().toISOString();
      return {
        status: "available",
        sourceUrl,
        observedAt,
        rows: parseCsv(await response.text()),
      };
    } catch (error) {
      return {
        status: "unavailable",
        sourceUrl,
        observedAt: null,
        error: errorMessage(error),
      };
    }
  }
}

function requiredWeek(request: ProviderIngestionRequest): number {
  if (request.week === null) {
    throw new Error(
      "nflverse history must be ingested one week at a time for reproducible snapshots.",
    );
  }
  return request.week;
}

function integer(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function number(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fantasyPosition(value: string | undefined): PlayerPosition | null {
  if (value === "FB") return "RB";
  return value === "QB" ||
    value === "RB" ||
    value === "WR" ||
    value === "TE" ||
    value === "K" ||
    value === "DST"
    ? value
    : null;
}

function rosterStatus(value: string | undefined): PlayerStatus {
  switch (value?.toUpperCase()) {
    case "ACT":
      return "active";
    case "RES":
    case "IR":
      return "injured_reserve";
    case "PUP":
      return "physically_unable_to_perform";
    case "SUS":
      return "suspended";
    case "RET":
      return "retired";
    case "DEV":
    case "INA":
      return "inactive";
    default:
      return "unknown";
  }
}

function rowsForScope(
  dataset: NflverseDataset,
  predicate: (row: CsvRow) => boolean,
): CsvRow[] {
  return dataset.status === "available" ? dataset.rows.filter(predicate) : [];
}

function coverage(
  dataset: NflverseDataset,
  name: NflverseDatasetName,
  recordCount: number,
): SourceCoverage {
  return dataset.status === "available"
    ? {
        dataset: name,
        status: "available",
        recordCount,
        sourceUrl: dataset.sourceUrl,
        observedAt: dataset.observedAt,
        detail:
          name === "play_by_play_participation"
            ? "Play-level participation is supplemental and may be delayed until a season is complete."
            : null,
      }
    : {
        dataset: name,
        status: "unavailable",
        recordCount: 0,
        sourceUrl: dataset.sourceUrl,
        observedAt: null,
        detail: dataset.error,
      };
}

function latestObservedAt(datasets: NflverseDataset[]): string {
  const timestamps = datasets.flatMap((dataset) =>
    dataset.status === "available" ? [dataset.observedAt] : [],
  );
  if (timestamps.length === 0) {
    throw new Error("No nflverse dataset was available.");
  }
  return timestamps.sort().at(-1)!;
}

function playerAliases(row: CsvRow): ProviderPlayerIdentity["aliases"] {
  const aliases: ProviderPlayerIdentity["aliases"] = [];
  if (row.sleeper_id?.trim()) {
    aliases.push({
      providerSlug: "sleeper",
      providerName: "Sleeper",
      externalId: row.sleeper_id.trim(),
    });
  }
  return aliases;
}

function normalizePlayers(rows: CsvRow[]): ProviderPlayerIdentity[] {
  const players = new Map<string, ProviderPlayerIdentity>();
  for (const row of rows) {
    const externalPlayerId = row.gsis_id?.trim();
    const position = fantasyPosition(row.position);
    const fullName = row.full_name?.trim();
    if (!externalPlayerId || !position || !fullName) continue;

    players.set(externalPlayerId, {
      externalPlayerId,
      fullName,
      position,
      nflTeam: row.team?.trim() || null,
      byeWeek: null,
      status: rosterStatus(row.status),
      aliases: playerAliases(row),
      raw: row,
    });
  }
  return [...players.values()];
}

const HISTORICAL_STAT_FIELDS = {
  completions: "completions",
  attempts: "passingAttempts",
  passing_yards: "passingYards",
  passing_tds: "passingTouchdowns",
  passing_interceptions: "passingInterceptions",
  carries: "carries",
  rushing_yards: "rushingYards",
  rushing_tds: "rushingTouchdowns",
  receptions: "receptions",
  targets: "targets",
  receiving_yards: "receivingYards",
  receiving_tds: "receivingTouchdowns",
  target_share: "targetShare",
  air_yards_share: "airYardsShare",
  wopr: "weightedOpportunityRating",
  fg_made: "fieldGoalsMade",
  fg_att: "fieldGoalsAttempted",
  pat_made: "extraPointsMade",
  pat_att: "extraPointsAttempted",
  fantasy_points: "fantasyPointsStandard",
  fantasy_points_ppr: "fantasyPointsPpr",
} as const;

function metricsFromStats(row: CsvRow): Record<string, number> {
  return Object.fromEntries(
    Object.entries(HISTORICAL_STAT_FIELDS).flatMap(([source, target]) => {
      const value = number(row[source]);
      return value === null ? [] : [[target, value]];
    }),
  );
}

function participationSnaps(rows: CsvRow[]): Map<string, number> {
  const snaps = new Map<string, number>();
  for (const row of rows) {
    const players = new Set(
      (row.offense_players ?? "")
        .split(";")
        .map((playerId) => playerId.trim())
        .filter(Boolean),
    );
    players.forEach((playerId) =>
      snaps.set(playerId, (snaps.get(playerId) ?? 0) + 1),
    );
  }
  return snaps;
}

function normalizePlayerRecords(
  rows: CsvRow[],
  participationRows: CsvRow[],
  season: number,
  week: number,
): ProviderRecordCandidate[] {
  const records: ProviderRecordCandidate[] = [];
  const snaps = participationSnaps(participationRows);

  for (const row of rows) {
    const externalPlayerId = row.player_id?.trim();
    if (!externalPlayerId || !fantasyPosition(row.position)) continue;
    const stats = metricsFromStats(row);
    const gameId = row.game_id?.trim() || `${season}-${week}`;

    records.push({
      externalPlayerId,
      recordKey: `${externalPlayerId}:historical-performance:${season}:${week}:${gameId}`,
      normalized: {
        type: "historical_performance",
        fantasyPoints: null,
        stats,
      },
      raw: row,
    });

    const usageMetrics = Object.fromEntries(
      [
        ["passingAttempts", number(row.attempts)],
        ["carries", number(row.carries)],
        ["targets", number(row.targets)],
        ["receptions", number(row.receptions)],
        ["targetShare", number(row.target_share)],
        ["airYardsShare", number(row.air_yards_share)],
        ["weightedOpportunityRating", number(row.wopr)],
        ["offensiveSnaps", snaps.get(externalPlayerId) ?? null],
      ].flatMap(([key, value]) =>
        typeof value === "number" ? [[key as string, value]] : [],
      ),
    );
    records.push({
      externalPlayerId,
      recordKey: `${externalPlayerId}:usage:${season}:${week}:${gameId}`,
      normalized: { type: "usage", metrics: usageMetrics },
      raw: {
        weeklyStats: row,
        playByPlayParticipation: {
          offensiveSnaps: snaps.get(externalPlayerId) ?? null,
        },
      },
    });
  }
  return records;
}

function zonedDateTimeToIso(
  date: string | undefined,
  time: string | undefined,
): string | null {
  if (!date?.trim() || !time?.trim()) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;

  const desiredUtc = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  let resolved = desiredUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(resolved))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const formattedYear = parts.year;
    const formattedMonth = parts.month;
    const formattedDay = parts.day;
    const formattedHour = parts.hour;
    const formattedMinute = parts.minute;
    if (
      formattedYear === undefined ||
      formattedMonth === undefined ||
      formattedDay === undefined ||
      formattedHour === undefined ||
      formattedMinute === undefined
    ) {
      return null;
    }
    const formattedUtc = Date.UTC(
      formattedYear,
      formattedMonth - 1,
      formattedDay,
      formattedHour,
      formattedMinute,
    );
    resolved += desiredUtc - formattedUtc;
  }
  return new Date(resolved).toISOString();
}

function seasonType(value: string | undefined): ProviderGame["seasonType"] {
  if (value === "PRE" || value === "REG") return value;
  return "POST";
}

function normalizeGames(rows: CsvRow[]): ProviderGame[] {
  return rows.flatMap((row) => {
    const externalGameId = row.game_id?.trim();
    const gameSeason = integer(row.season);
    const gameWeek = integer(row.week);
    const homeTeam = row.home_team?.trim();
    const awayTeam = row.away_team?.trim();
    if (
      !externalGameId ||
      gameSeason === null ||
      gameWeek === null ||
      !homeTeam ||
      !awayTeam
    ) {
      return [];
    }
    return [
      {
        externalGameId,
        season: gameSeason,
        week: gameWeek,
        seasonType: seasonType(row.game_type),
        kickoffAt: zonedDateTimeToIso(row.gameday, row.gametime),
        homeTeam,
        awayTeam,
        homeScore: integer(row.home_score),
        awayScore: integer(row.away_score),
        neutralSite: row.location?.trim().toLowerCase() === "neutral",
        raw: row,
      },
    ];
  });
}

export class NflverseProviderAdapter implements FantasyDataProviderAdapter<NflversePayload> {
  readonly descriptor = NFLVERSE_PROVIDER_DESCRIPTOR;

  constructor(
    private readonly client: NflverseDataClient = new HttpNflverseDataClient(),
  ) {}

  async fetch(request: ProviderIngestionRequest): Promise<NflversePayload> {
    const week = requiredWeek(request);
    const urls = nflverseSourceUrls(request.season);
    const results = await Promise.all(
      NFLVERSE_DATASETS.map(
        async (dataset) =>
          [
            dataset,
            await this.client.fetchDataset(dataset, urls[dataset]),
          ] as const,
      ),
    );
    const datasets = Object.fromEntries(results) as Record<
      NflverseDatasetName,
      NflverseDataset
    >;
    if (
      Object.values(datasets).every(
        (dataset) => dataset.status === "unavailable",
      )
    ) {
      throw new Error(
        `All nflverse datasets were unavailable: ${NFLVERSE_DATASETS.join(", ")}.`,
      );
    }
    return { season: request.season, week, datasets };
  }

  normalize(
    payload: NflversePayload,
    request: ProviderIngestionRequest,
  ): ProviderSnapshotCandidate {
    const week = requiredWeek(request);
    if (payload.season !== request.season || payload.week !== week) {
      throw new Error("nflverse payload scope does not match the request.");
    }

    const rosterRows = rowsForScope(
      payload.datasets.weekly_rosters,
      (row) =>
        integer(row.season) === request.season && integer(row.week) === week,
    );
    const statRows = rowsForScope(
      payload.datasets.weekly_player_stats,
      (row) =>
        integer(row.season) === request.season && integer(row.week) === week,
    );
    const gamePrefix = `${request.season}_${String(week).padStart(2, "0")}_`;
    const participationRows = rowsForScope(
      payload.datasets.play_by_play_participation,
      (row) => row.nflverse_game_id?.startsWith(gamePrefix) ?? false,
    );
    const scheduleRows = rowsForScope(
      payload.datasets.schedules,
      (row) =>
        integer(row.season) === request.season && integer(row.week) === week,
    );
    const scopedRows: Record<NflverseDatasetName, CsvRow[]> = {
      weekly_rosters: rosterRows,
      weekly_player_stats: statRows,
      play_by_play_participation: participationRows,
      schedules: scheduleRows,
    };

    return {
      season: request.season,
      week,
      observedAt: latestObservedAt(Object.values(payload.datasets)),
      provenance: {
        source: this.descriptor.name,
        sourceId: `${request.season}-week-${week}`,
        sourceUrl: "https://github.com/nflverse/nflverse-data",
        notes: [
          "Historical and usage signals are factual context, not projections.",
          request.season >= 2023
            ? "Attribution: play-level participation is FTN Data via nflverse when present."
            : "Attribution: play-level participation is NFL NextGenStats via nflverse when present.",
        ],
        coverage: NFLVERSE_DATASETS.map((dataset) =>
          coverage(
            payload.datasets[dataset],
            dataset,
            scopedRows[dataset].length,
          ),
        ),
      },
      players: normalizePlayers(rosterRows),
      games: normalizeGames(scheduleRows),
      records: normalizePlayerRecords(
        statRows,
        participationRows,
        request.season,
        week,
      ),
    };
  }
}

export const nflverseProviderAdapter = new NflverseProviderAdapter();
