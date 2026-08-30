import type {
  ProviderDescriptor,
  ProviderIngestionRequest,
  ProviderPlayerIdentity,
  ProviderRecordCandidate,
  ProviderSnapshotCandidate,
  SourceCoverage,
} from "@/domain/fantasy-data";
import {
  datasetRows,
  fetchJsonDataset,
  numberField,
  numericStats,
  normalizeProjectionStats,
  observedAt,
  playerPosition,
  playerStatus,
  positiveIntegerField,
  stringField,
  type JsonDataset,
  type JsonRecord,
} from "@/providers/shared/normalized-feed";
import type { FantasyDataProviderAdapter } from "@/providers/types";

export const FANTASYPROS_DATASETS = [
  "players",
  "rankings",
  "projections",
  "injuries",
  "news",
] as const;

export type FantasyProsDatasetName = (typeof FANTASYPROS_DATASETS)[number];

export type FantasyProsPayload = {
  datasets: Record<FantasyProsDatasetName, JsonDataset>;
};

export const FANTASYPROS_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  slug: "fantasypros",
  name: "FantasyPros",
  adapterVersion: "1.0.0",
  staleAfterSeconds: 21_600,
};

type FantasyProsScoring = "standard" | "half_ppr" | "ppr";

export interface FantasyProsDataClient {
  fetchAll(
    request: ProviderIngestionRequest,
    scoring: FantasyProsScoring,
  ): Promise<FantasyProsPayload>;
}

const API_ROOT = "https://api.fantasypros.com/public/v2/json";

function scoringParameter(scoring: FantasyProsScoring): string {
  return scoring === "standard"
    ? "STD"
    : scoring === "half_ppr"
      ? "HALF"
      : "PPR";
}

function datasetUrl(
  dataset: FantasyProsDatasetName,
  request: ProviderIngestionRequest,
  scoring: FantasyProsScoring,
): string {
  const params = new URLSearchParams();
  if (dataset === "rankings" || dataset === "projections") {
    params.set("scoring", scoringParameter(scoring));
  }
  if (request.week !== null && dataset !== "players" && dataset !== "news") {
    params.set("week", String(request.week));
  }
  let path: string;
  switch (dataset) {
    case "players":
      path = "/nfl/players";
      break;
    case "rankings":
      path = `/nfl/${request.season}/consensus-rankings`;
      break;
    case "projections":
      path = `/nfl/${request.season}/projections`;
      break;
    case "injuries":
      path = "/nfl/injuries";
      params.set("season", String(request.season));
      break;
    case "news":
      path = "/nfl/news";
      break;
  }
  const query = params.toString();
  return `${API_ROOT}${path}${query ? `?${query}` : ""}`;
}

export class HttpFantasyProsDataClient implements FantasyProsDataClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock: () => Date = () => new Date(),
  ) {
    if (!apiKey.trim()) throw new Error("A FantasyPros API key is required.");
  }

  async fetchAll(
    request: ProviderIngestionRequest,
    scoring: FantasyProsScoring,
  ): Promise<FantasyProsPayload> {
    const entries = await Promise.all(
      FANTASYPROS_DATASETS.map(async (dataset) => {
        const sourceUrl = datasetUrl(dataset, request, scoring);
        const result = await fetchJsonDataset(
          this.fetcher,
          sourceUrl,
          {
            headers: {
              accept: "application/json",
              "x-api-key": this.apiKey,
            },
          },
          this.clock,
        );
        return [dataset, result] as const;
      }),
    );
    return {
      datasets: Object.fromEntries(entries) as FantasyProsPayload["datasets"],
    };
  }
}

function externalPlayerId(row: JsonRecord): string | null {
  return stringField(row, "player_id", "playerId", "id");
}

function playerName(row: JsonRecord): string | null {
  return stringField(row, "player_name", "playerName", "name");
}

function playerTeam(row: JsonRecord): string | null {
  const team = stringField(row, "player_team_id", "team_id", "team");
  return team && /^[A-Z]{2,3}$/.test(team.toUpperCase())
    ? team.toUpperCase()
    : null;
}

function allRows(payload: FantasyProsPayload): JsonRecord[] {
  return FANTASYPROS_DATASETS.flatMap((dataset) =>
    datasetRows(payload.datasets[dataset], [
      "players",
      "items",
      "news",
      "results",
    ]),
  );
}

function identities(payload: FantasyProsPayload): ProviderPlayerIdentity[] {
  const byId = new Map<string, JsonRecord>();
  for (const row of allRows(payload)) {
    const id = externalPlayerId(row);
    if (!id) continue;
    const current = byId.get(id);
    if (
      !current ||
      datasetRows(payload.datasets.players, ["players"]).includes(row)
    ) {
      byId.set(id, row);
    }
  }
  const result: ProviderPlayerIdentity[] = [];
  for (const [id, row] of byId) {
    const fullName = playerName(row);
    const position = playerPosition(
      stringField(row, "player_position_id", "position_id", "position"),
    );
    if (!fullName || !position) continue;
    const sleeperId = stringField(row, "player_sleeper_id", "sleeper_id");
    result.push({
      externalPlayerId: id,
      fullName,
      position,
      nflTeam: playerTeam(row),
      byeWeek: positiveIntegerField(row, "bye_week", "bye"),
      status: playerStatus(stringField(row, "player_status", "status")),
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
  return result;
}

function rankings(payload: FantasyProsPayload): ProviderRecordCandidate[] {
  return datasetRows(payload.datasets.rankings, [
    "players",
    "rankings",
    "results",
  ]).flatMap((row): ProviderRecordCandidate[] => {
    const id = externalPlayerId(row);
    const rank = numberField(row, "rank_ecr", "ecr", "rank");
    if (!id || rank === null || rank <= 0) return [];
    const records: ProviderRecordCandidate[] = [
      {
        recordKey: "consensus-ranking",
        externalPlayerId: id,
        normalized: {
          type: "ranking",
          rank,
          positionRank: positiveIntegerField(row, "rank_position", "pos_rank"),
          tier: positiveIntegerField(row, "tier"),
          expertCount: positiveIntegerField(row, "experts", "expert_count"),
        },
        raw: row,
      },
    ];
    const adp = numberField(row, "rank_adp", "adp", "average_draft_position");
    if (adp !== null && adp > 0) {
      records.push({
        recordKey: "consensus-adp",
        externalPlayerId: id,
        normalized: {
          type: "adp",
          overall: adp,
          position: numberField(row, "pos_adp", "position_adp"),
          sampleSize: positiveIntegerField(row, "adp_sources", "sample_size"),
          format: stringField(row, "scoring", "format"),
        },
        raw: row,
      });
    }
    return records;
  });
}

const PROJECTION_METADATA = new Set([
  "player_id",
  "playerId",
  "id",
  "player_name",
  "playerName",
  "name",
  "player_team_id",
  "team_id",
  "team",
  "player_position_id",
  "position_id",
  "position",
  "fantasy_points",
  "projected_points",
  "fpts",
]);

function projections(
  payload: FantasyProsPayload,
  scoring: FantasyProsScoring,
): ProviderRecordCandidate[] {
  return datasetRows(payload.datasets.projections, [
    "players",
    "projections",
    "results",
  ]).flatMap((row): ProviderRecordCandidate[] => {
    const id = externalPlayerId(row);
    if (!id) return [];
    return [
      {
        recordKey: "projection",
        externalPlayerId: id,
        normalized: {
          type: "projection",
          scoring,
          projectedPoints: numberField(
            row,
            "fantasy_points",
            "projected_points",
            "fpts",
          ),
          stats: normalizeProjectionStats(
            numericStats(row, PROJECTION_METADATA),
          ),
        },
        raw: row,
      },
    ];
  });
}

function injuries(payload: FantasyProsPayload): ProviderRecordCandidate[] {
  return datasetRows(payload.datasets.injuries, [
    "players",
    "injuries",
    "results",
  ]).flatMap((row): ProviderRecordCandidate[] => {
    const id = externalPlayerId(row);
    if (!id) return [];
    return [
      {
        recordKey: "injury",
        externalPlayerId: id,
        normalized: {
          type: "injury",
          status: playerStatus(
            stringField(row, "injury_status", "game_status", "status"),
          ),
          practiceStatus: stringField(row, "practice_status", "practice"),
          details: stringField(row, "injury_description", "injury", "details"),
        },
        raw: row,
      },
    ];
  });
}

function news(payload: FantasyProsPayload): ProviderRecordCandidate[] {
  return datasetRows(payload.datasets.news, [
    "items",
    "news",
    "results",
  ]).flatMap((row, index): ProviderRecordCandidate[] => {
    const id = externalPlayerId(row);
    const headline = stringField(row, "headline", "title");
    const date = stringField(row, "published_at", "publishedAt", "date");
    const parsedDate = date ? new Date(date) : null;
    if (!id || !headline || !parsedDate || Number.isNaN(parsedDate.valueOf())) {
      return [];
    }
    const url = stringField(row, "url", "link");
    return [
      {
        recordKey: `news:${stringField(row, "news_id", "id") ?? index}`,
        externalPlayerId: id,
        normalized: {
          type: "news",
          headline,
          summary: stringField(row, "summary", "description", "body"),
          publishedAt: parsedDate.toISOString(),
          url: url && URL.canParse(url) ? url : null,
        },
        raw: row,
      },
    ];
  });
}

export class FantasyProsProviderAdapter implements FantasyDataProviderAdapter<FantasyProsPayload> {
  readonly descriptor = FANTASYPROS_PROVIDER_DESCRIPTOR;

  constructor(
    private readonly client: FantasyProsDataClient,
    private readonly scoring: FantasyProsScoring = "ppr",
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async fetch(request: ProviderIngestionRequest): Promise<FantasyProsPayload> {
    const payload = await this.client.fetchAll(request, this.scoring);
    if (
      FANTASYPROS_DATASETS.every(
        (name) => payload.datasets[name].status === "unavailable",
      )
    ) {
      throw new Error("All FantasyPros datasets were unavailable.");
    }
    const normalized = this.normalize(payload, request);
    const hasNormalizedData = [
      normalized.players,
      normalized.records,
      normalized.games,
    ].some((value) => Array.isArray(value) && value.length > 0);
    if (!hasNormalizedData) {
      throw new Error("FantasyPros returned no recognized records.");
    }
    return payload;
  }

  normalize(
    payload: FantasyProsPayload,
    request: ProviderIngestionRequest,
  ): ProviderSnapshotCandidate {
    const datasets = FANTASYPROS_DATASETS.map((name) => payload.datasets[name]);
    const coverage: SourceCoverage[] = FANTASYPROS_DATASETS.map((name) => {
      const dataset = payload.datasets[name];
      const rows = datasetRows(dataset, [
        "players",
        "rankings",
        "projections",
        "injuries",
        "items",
        "news",
        "results",
      ]);
      return {
        dataset: name,
        status: dataset.status,
        recordCount: rows.length,
        sourceUrl: dataset.sourceUrl,
        observedAt: dataset.observedAt,
        detail: dataset.status === "unavailable" ? dataset.error : null,
      };
    });
    const fallback = this.clock().toISOString();
    return {
      season: request.season,
      week: request.week,
      observedAt: observedAt(datasets, fallback),
      provenance: {
        source: "FantasyPros API",
        sourceId: `${request.season}:${request.week ?? "preseason"}:${this.scoring}`,
        sourceUrl: "https://api.fantasypros.com/public/v2/docs",
        notes: [
          "Personal-use provider data; raw values remain attributed and are not redistributed.",
        ],
        coverage,
      },
      players: identities(payload),
      records: [
        ...rankings(payload),
        ...projections(payload, this.scoring),
        ...injuries(payload),
        ...news(payload),
      ],
      games: [],
    };
  }
}
