import { z } from "zod";

import type {
  JsonValue,
  ProviderDescriptor,
  ProviderIngestionRequest,
  ProviderPlayerIdentity,
  ProviderSnapshotCandidate,
} from "@/domain/fantasy-data";
import type { PlayerPosition, PlayerStatus } from "@/domain/player";
import type { FantasyDataProviderAdapter } from "@/providers/types";

const SLEEPER_PLAYER_CATALOG_URL =
  "https://api.sleeper.app/v1/players/nfl?active=true";

const stringOrNumber = z.union([z.string(), z.number()]);
const sleeperPlayerSchema = z
  .object({
    player_id: stringOrNumber,
    full_name: z.string().nullable().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    position: z.string().nullable().optional(),
    fantasy_positions: z.array(z.string()).nullable().optional(),
    team: z.string().nullable().optional(),
    active: z.boolean().optional(),
    status: z.string().nullable().optional(),
    injury_status: z.string().nullable().optional(),
    yahoo_id: stringOrNumber.nullable().optional(),
    espn_id: stringOrNumber.nullable().optional(),
    fantasy_data_id: stringOrNumber.nullable().optional(),
    sportradar_id: stringOrNumber.nullable().optional(),
  })
  .passthrough();

type SleeperPlayer = z.infer<typeof sleeperPlayerSchema>;

export type SleeperPlayerCatalogPayload = {
  season: number;
  sourceUrl: string;
  observedAt: string;
  players: Record<string, JsonValue>;
};

export interface SleeperPlayerCatalogClient {
  fetchPlayers(season: number): Promise<SleeperPlayerCatalogPayload>;
}

export const SLEEPER_PLAYER_CATALOG_DESCRIPTOR: ProviderDescriptor = {
  slug: "sleeper-player-catalog",
  name: "Sleeper Player Catalog",
  adapterVersion: "1.0.0-player-catalog",
  staleAfterSeconds: 86_400,
};

function utcDay(date: Date): string {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  ).toISOString();
}

export class HttpSleeperPlayerCatalogClient implements SleeperPlayerCatalogClient {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async fetchPlayers(season: number): Promise<SleeperPlayerCatalogPayload> {
    const response = await this.fetcher(SLEEPER_PLAYER_CATALOG_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(
        `Sleeper player catalog returned HTTP ${response.status}.`,
      );
    }

    const payload = z
      .record(z.string(), z.unknown())
      .parse(await response.json());
    const players = Object.fromEntries(
      Object.entries(payload).map(([id, value]) => [id, value as JsonValue]),
    );
    const lastModified = response.headers.get("last-modified");

    return {
      season,
      sourceUrl: SLEEPER_PLAYER_CATALOG_URL,
      observedAt: lastModified
        ? new Date(lastModified).toISOString()
        : utcDay(this.clock()),
      players,
    };
  }
}

function positionFor(player: SleeperPlayer): PlayerPosition | null {
  const positions = [
    player.position,
    ...(player.fantasy_positions ?? []),
  ].filter(Boolean);

  for (const position of positions) {
    if (position === "DEF" || position === "DST") return "DST";
    if (
      position === "QB" ||
      position === "RB" ||
      position === "WR" ||
      position === "TE" ||
      position === "K"
    ) {
      return position;
    }
  }
  return null;
}

function statusFor(player: SleeperPlayer): PlayerStatus {
  const status = `${player.injury_status ?? ""} ${player.status ?? ""}`
    .trim()
    .toUpperCase();
  if (/\bQ(?:UESTIONABLE)?\b/.test(status)) return "questionable";
  if (/\bD(?:OUBTFUL)?\b/.test(status)) return "doubtful";
  if (/\bPUP\b|PHYSICALLY UNABLE/.test(status)) {
    return "physically_unable_to_perform";
  }
  if (/\bIR\b|INJURED RESERVE/.test(status)) return "injured_reserve";
  if (/SUSP/.test(status)) return "suspended";
  if (/\bOUT\b/.test(status)) return "out";
  if (/RETIR/.test(status)) return "retired";
  if (player.active === false || /INACTIVE/.test(status)) return "inactive";
  return "active";
}

function fullName(
  player: SleeperPlayer,
  position: PlayerPosition,
): string | null {
  const explicit = player.full_name?.trim();
  if (explicit) return explicit;

  const joined = [player.first_name, player.last_name]
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => part.trim())
    .join(" ");
  if (joined) return joined;

  const team = player.team?.trim().toUpperCase();
  return position === "DST" && team ? `${team} Defense` : null;
}

function alias(
  providerSlug: string,
  providerName: string,
  value: string | number | null | undefined,
): ProviderPlayerIdentity["aliases"][number] | null {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  return { providerSlug, providerName, externalId: String(value).trim() };
}

function normalizePlayers(payload: SleeperPlayerCatalogPayload): unknown[] {
  return Object.entries(payload.players)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap<unknown>(([fallbackId, raw]): unknown[] => {
      const parsed = sleeperPlayerSchema.safeParse(raw);
      if (!parsed.success) {
        return [
          {
            externalPlayerId: fallbackId,
            fullName: "",
            position: "",
            nflTeam: null,
            byeWeek: null,
            status: "unknown",
            aliases: [],
            raw,
          },
        ];
      }

      const player = parsed.data;
      const position = positionFor(player);
      if (!position || player.active === false) return [];
      const name = fullName(player, position);
      if (!name) {
        return [
          {
            externalPlayerId: String(player.player_id),
            fullName: "",
            position,
            nflTeam: player.team?.trim().toUpperCase() || null,
            byeWeek: null,
            status: statusFor(player),
            aliases: [],
            raw,
          },
        ];
      }

      const aliases = [
        alias("sleeper", "Sleeper", player.player_id),
        alias("yahoo", "Yahoo Fantasy Sports", player.yahoo_id),
        alias("espn", "ESPN", player.espn_id),
        alias("fantasy-data", "FantasyData", player.fantasy_data_id),
        alias("sportradar", "Sportradar", player.sportradar_id),
      ].filter(
        (value): value is ProviderPlayerIdentity["aliases"][number] =>
          value !== null,
      );

      return [
        {
          externalPlayerId: String(player.player_id ?? fallbackId),
          fullName: name,
          position,
          nflTeam: player.team?.trim().toUpperCase() || null,
          byeWeek: null,
          status: statusFor(player),
          aliases,
          raw,
        },
      ];
    });
}

export class SleeperPlayerCatalogAdapter implements FantasyDataProviderAdapter<SleeperPlayerCatalogPayload> {
  readonly descriptor = SLEEPER_PLAYER_CATALOG_DESCRIPTOR;

  constructor(
    private readonly client: SleeperPlayerCatalogClient = new HttpSleeperPlayerCatalogClient(),
  ) {}

  async fetch(
    request: ProviderIngestionRequest,
  ): Promise<SleeperPlayerCatalogPayload> {
    if (request.week !== null) {
      throw new Error(
        "The Sleeper player catalog is season-scoped, not weekly.",
      );
    }
    return this.client.fetchPlayers(request.season);
  }

  normalize(
    payload: SleeperPlayerCatalogPayload,
    request: ProviderIngestionRequest,
  ): ProviderSnapshotCandidate {
    if (payload.season !== request.season || request.week !== null) {
      throw new Error(
        "Sleeper player catalog scope does not match the request.",
      );
    }

    const players = normalizePlayers(payload);
    return {
      season: request.season,
      week: null,
      observedAt: payload.observedAt,
      provenance: {
        source: this.descriptor.name,
        sourceId: `nfl-player-catalog-${request.season}`,
        sourceUrl: "https://docs.sleeper.com/#players",
        notes: [
          "Attribution: Sleeper NFL Players API.",
          "This catalog supplies player identity and roster metadata only; it does not supply rankings, ADP, or projections.",
          "Sleeper documents this API for non-commercial use; commercial use requires separate permission.",
          "The player catalog should be refreshed no more than once per day.",
        ],
        coverage: [
          {
            dataset: "sleeper_nfl_player_catalog",
            status: "available",
            recordCount: players.length,
            sourceUrl: payload.sourceUrl,
            observedAt: payload.observedAt,
            detail: "Active QB, RB, WR, TE, K, and team-defense identities.",
          },
        ],
      },
      records: [],
      players,
      games: [],
    };
  }
}

export const sleeperPlayerCatalogAdapter = new SleeperPlayerCatalogAdapter();
