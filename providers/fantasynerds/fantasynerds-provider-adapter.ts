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
  observedAt,
  playerPosition,
  playerStatus,
  positiveIntegerField,
  stringField,
  type JsonDataset,
  type JsonRecord,
} from "@/providers/shared/normalized-feed";
import type { FantasyDataProviderAdapter } from "@/providers/types";

export const FANTASYNERDS_DATASETS = [
  "players",
  "rankings",
  "projections",
  "adp",
  "injuries",
  "news",
] as const;

export type FantasyNerdsDatasetName = (typeof FANTASYNERDS_DATASETS)[number];

export type FantasyNerdsPayload = {
  datasets: Record<FantasyNerdsDatasetName, JsonDataset>;
};

export const FANTASYNERDS_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  slug: "fantasynerds",
  name: "Fantasy Nerds",
  adapterVersion: "1.0.0",
  staleAfterSeconds: 21_600,
};

type FantasyNerdsScoring = "standard" | "half_ppr" | "ppr";

export interface FantasyNerdsDataClient {
  fetchAll(
    request: ProviderIngestionRequest,
    scoring: FantasyNerdsScoring,
  ): Promise<FantasyNerdsPayload>;
}

const API_ROOT = "https://api.fantasynerds.com/v1/nfl";

function scoringParameter(scoring: FantasyNerdsScoring): string {
  return scoring === "standard"
    ? "std"
    : scoring === "half_ppr"
      ? "half"
      : "ppr";
}

function resource(
  dataset: FantasyNerdsDatasetName,
  request: ProviderIngestionRequest,
): string {
  if (dataset === "rankings") {
    return request.week === null ? "draft-rankings" : "weekly-rankings";
  }
  if (dataset === "projections") {
    return request.week === null ? "draft-projections" : "weekly-projections";
  }
  return dataset;
}

export class HttpFantasyNerdsDataClient implements FantasyNerdsDataClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock: () => Date = () => new Date(),
  ) {
    if (!apiKey.trim()) throw new Error("A Fantasy Nerds API key is required.");
  }

  async fetchAll(
    request: ProviderIngestionRequest,
    scoring: FantasyNerdsScoring,
  ): Promise<FantasyNerdsPayload> {
    const entries = await Promise.all(
      FANTASYNERDS_DATASETS.map(async (dataset) => {
        const endpoint = `${API_ROOT}/${resource(dataset, request)}`;
        const url = new URL(endpoint);
        url.searchParams.set("apikey", this.apiKey);
        if (dataset === "rankings" || dataset === "adp") {
          url.searchParams.set("format", scoringParameter(scoring));
        }
        if (
          request.week !== null &&
          (dataset === "rankings" || dataset === "projections")
        ) {
          url.searchParams.set("week", String(request.week));
        }
        const fetched = await fetchJsonDataset(
          this.fetcher,
          url.toString(),
          { headers: { accept: "application/json" } },
          this.clock,
        );
        const result: JsonDataset = { ...fetched, sourceUrl: endpoint };
        return [dataset, result] as const;
      }),
    );
    return {
      datasets: Object.fromEntries(entries) as FantasyNerdsPayload["datasets"],
    };
  }
}

function externalPlayerId(row: JsonRecord): string | null {
  return stringField(row, "playerId", "player_id", "id");
}

function rowsFor(
  payload: FantasyNerdsPayload,
  dataset: FantasyNerdsDatasetName,
): JsonRecord[] {
  return datasetRows(payload.datasets[dataset], [
    "players",
    "rankings",
    "projections",
    "injuries",
    "news",
    "results",
  ]);
}

function identities(payload: FantasyNerdsPayload): ProviderPlayerIdentity[] {
  const combined = FANTASYNERDS_DATASETS.flatMap((dataset) =>
    rowsFor(payload, dataset),
  );
  const byId = new Map<string, JsonRecord>();
  for (const row of combined) {
    const id = externalPlayerId(row);
    if (id && !byId.has(id)) byId.set(id, row);
  }
  return [...byId].flatMap(([id, row]): ProviderPlayerIdentity[] => {
    const fullName = stringField(row, "name", "player_name", "playerName");
    const position = playerPosition(stringField(row, "position"));
    if (!fullName || !position) return [];
    const rawTeam = stringField(row, "team", "team_code");
    const nflTeam =
      rawTeam && /^[A-Z]{2,3}$/.test(rawTeam.toUpperCase())
        ? rawTeam.toUpperCase()
        : null;
    return [
      {
        externalPlayerId: id,
        fullName,
        position,
        nflTeam,
        byeWeek: positiveIntegerField(row, "bye_week", "bye"),
        status: playerStatus(
          stringField(row, "active", "status", "game_status"),
        ),
        aliases: [],
        raw: row,
      },
    ];
  });
}

function rankingRecords(
  payload: FantasyNerdsPayload,
): ProviderRecordCandidate[] {
  return rowsFor(payload, "rankings").flatMap(
    (row): ProviderRecordCandidate[] => {
      const id = externalPlayerId(row);
      const rank = numberField(row, "rank");
      if (!id || rank === null || rank <= 0) return [];
      return [
        {
          recordKey: "consensus-ranking",
          externalPlayerId: id,
          normalized: {
            type: "ranking",
            rank,
            positionRank: positiveIntegerField(row, "rank_position"),
            tier: positiveIntegerField(row, "tier"),
            expertCount: positiveIntegerField(row, "expert_count", "experts"),
          },
          raw: row,
        },
      ];
    },
  );
}

const PROJECTION_METADATA = new Set([
  "playerId",
  "player_id",
  "id",
  "name",
  "player_name",
  "position",
  "team",
  "team_code",
  "proj_pts",
  "proj_pts_ppr",
]);

function projectionRecords(
  payload: FantasyNerdsPayload,
  scoring: FantasyNerdsScoring,
): ProviderRecordCandidate[] {
  return rowsFor(payload, "projections").flatMap(
    (row): ProviderRecordCandidate[] => {
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
              scoring === "ppr" ? "proj_pts_ppr" : "proj_pts",
              "proj_pts",
            ),
            stats: numericStats(row, PROJECTION_METADATA),
          },
          raw: row,
        },
      ];
    },
  );
}

function adpRecords(payload: FantasyNerdsPayload): ProviderRecordCandidate[] {
  return rowsFor(payload, "adp").flatMap((row): ProviderRecordCandidate[] => {
    const id = externalPlayerId(row);
    const overall = numberField(row, "adp", "overall", "rank");
    if (!id || overall === null || overall <= 0) return [];
    return [
      {
        recordKey: "adp",
        externalPlayerId: id,
        normalized: {
          type: "adp",
          overall,
          position: numberField(row, "rank_position", "position_adp"),
          sampleSize: positiveIntegerField(row, "sample_size"),
          format: stringField(row, "format"),
        },
        raw: row,
      },
    ];
  });
}

function injuryRecords(
  payload: FantasyNerdsPayload,
): ProviderRecordCandidate[] {
  return rowsFor(payload, "injuries").flatMap(
    (row): ProviderRecordCandidate[] => {
      const id = externalPlayerId(row);
      if (!id) return [];
      return [
        {
          recordKey: "injury",
          externalPlayerId: id,
          normalized: {
            type: "injury",
            status: playerStatus(stringField(row, "game_status", "status")),
            practiceStatus: stringField(row, "practice_status"),
            details: stringField(row, "injury"),
          },
          raw: row,
        },
      ];
    },
  );
}

function newsRecords(payload: FantasyNerdsPayload): ProviderRecordCandidate[] {
  return rowsFor(payload, "news").flatMap(
    (row, index): ProviderRecordCandidate[] => {
      const id = externalPlayerId(row);
      const headline = stringField(row, "article_headline", "headline");
      const rawDate = stringField(row, "article_date", "published_at");
      const date = rawDate ? new Date(rawDate) : null;
      if (!id || !headline || !date || Number.isNaN(date.valueOf())) return [];
      const link = stringField(row, "article_link", "url");
      return [
        {
          recordKey: `news:${stringField(row, "article_id", "id") ?? index}`,
          externalPlayerId: id,
          normalized: {
            type: "news",
            headline,
            summary: stringField(row, "article_excerpt", "summary"),
            publishedAt: date.toISOString(),
            url: link && URL.canParse(link) ? link : null,
          },
          raw: row,
        },
      ];
    },
  );
}

export class FantasyNerdsProviderAdapter implements FantasyDataProviderAdapter<FantasyNerdsPayload> {
  readonly descriptor = FANTASYNERDS_PROVIDER_DESCRIPTOR;

  constructor(
    private readonly client: FantasyNerdsDataClient,
    private readonly scoring: FantasyNerdsScoring = "ppr",
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async fetch(request: ProviderIngestionRequest): Promise<FantasyNerdsPayload> {
    const payload = await this.client.fetchAll(request, this.scoring);
    if (
      FANTASYNERDS_DATASETS.every(
        (name) => payload.datasets[name].status === "unavailable",
      )
    ) {
      throw new Error("All Fantasy Nerds datasets were unavailable.");
    }
    if (
      FANTASYNERDS_DATASETS.every((name) => rowsFor(payload, name).length === 0)
    ) {
      throw new Error("Fantasy Nerds returned no recognized records.");
    }
    return payload;
  }

  normalize(
    payload: FantasyNerdsPayload,
    request: ProviderIngestionRequest,
  ): ProviderSnapshotCandidate {
    const datasets = FANTASYNERDS_DATASETS.map(
      (name) => payload.datasets[name],
    );
    const coverage: SourceCoverage[] = FANTASYNERDS_DATASETS.map((name) => {
      const dataset = payload.datasets[name];
      return {
        dataset: name,
        status: dataset.status,
        recordCount: rowsFor(payload, name).length,
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
        source: "Fantasy Nerds API",
        sourceId: `${request.season}:${request.week ?? "preseason"}:${this.scoring}`,
        sourceUrl: "https://api.fantasynerds.com/docs/nfl",
        notes: [
          "API access is optional; missing entitlement does not block other projection sources.",
        ],
        coverage,
      },
      players: identities(payload),
      records: [
        ...rankingRecords(payload),
        ...projectionRecords(payload, this.scoring),
        ...adpRecords(payload),
        ...injuryRecords(payload),
        ...newsRecords(payload),
      ],
      games: [],
    };
  }
}
