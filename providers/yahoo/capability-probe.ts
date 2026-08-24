export const YAHOO_FANTASY_API_ROOT =
  "https://fantasysports.yahooapis.com/fantasy/v2";

export const YAHOO_READ_ONLY_CAPABILITY_IDS = [
  "current_leagues",
  "league_history",
  "league_settings_scoring",
  "league_teams",
  "league_draft_results",
  "league_scoreboard_matchups",
  "league_standings",
  "league_transactions",
  "available_players",
  "team_roster",
] as const;

export type YahooReadOnlyCapabilityId =
  (typeof YAHOO_READ_ONLY_CAPABILITY_IDS)[number];

export type YahooCapabilityProbeStatus =
  | "supported"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "unavailable"
  | "error"
  | "not_tested";

type YahooProbeContext = {
  leagueKey: string | null;
  teamKey: string | null;
  week: number | null;
};

type YahooCapabilityDefinition = {
  id: YahooReadOnlyCapabilityId;
  label: string;
  method: "GET";
  requires: "none" | "league" | "team";
  path: (context: YahooProbeContext) => string;
};

export type YahooRateLimitObservation = {
  limit: string | null;
  remaining: string | null;
  reset: string | null;
  retryAfter: string | null;
};

export type YahooCapabilityProbeResult = {
  capability: YahooReadOnlyCapabilityId;
  label: string;
  method: "GET";
  url: string | null;
  status: YahooCapabilityProbeStatus;
  httpStatus: number | null;
  latencyMs: number | null;
  contentType: string | null;
  providerRefreshRateSeconds: number | null;
  rateLimit: YahooRateLimitObservation;
  detail: string | null;
};

export type YahooCapabilityReport = {
  observedAt: string;
  selectedLeagueKey: string | null;
  selectedTeamKey: string | null;
  week: number | null;
  requestCount: number;
  writeOperationsAttempted: 0;
  results: YahooCapabilityProbeResult[];
};

function leaguePath(context: YahooProbeContext, suffix: string): string {
  return `/league/${encodeURIComponent(context.leagueKey!)}/${suffix}`;
}

function teamPath(context: YahooProbeContext, suffix: string): string {
  return `/team/${encodeURIComponent(context.teamKey!)}/${suffix}`;
}

export const YAHOO_READ_ONLY_CAPABILITIES: readonly YahooCapabilityDefinition[] =
  [
    {
      id: "current_leagues",
      label: "Current NFL league discovery",
      method: "GET",
      requires: "none",
      path: () => "/users;use_login=1/games;game_keys=nfl/leagues",
    },
    {
      id: "league_history",
      label: "Historical league discovery",
      method: "GET",
      requires: "none",
      path: () => "/users;use_login=1/games/leagues",
    },
    {
      id: "league_settings_scoring",
      label: "League settings and scoring",
      method: "GET",
      requires: "league",
      path: (context) => leaguePath(context, "settings"),
    },
    {
      id: "league_teams",
      label: "League teams and managers",
      method: "GET",
      requires: "league",
      path: (context) => leaguePath(context, "teams"),
    },
    {
      id: "league_draft_results",
      label: "League draft results",
      method: "GET",
      requires: "league",
      path: (context) => leaguePath(context, "draftresults"),
    },
    {
      id: "league_scoreboard_matchups",
      label: "League scoreboard and matchups",
      method: "GET",
      requires: "league",
      path: (context) =>
        leaguePath(
          context,
          context.week === null
            ? "scoreboard"
            : `scoreboard;week=${context.week}`,
        ),
    },
    {
      id: "league_standings",
      label: "League standings",
      method: "GET",
      requires: "league",
      path: (context) => leaguePath(context, "standings"),
    },
    {
      id: "league_transactions",
      label: "League transactions",
      method: "GET",
      requires: "league",
      path: (context) => leaguePath(context, "transactions"),
    },
    {
      id: "available_players",
      label: "Available players",
      method: "GET",
      requires: "league",
      path: (context) =>
        leaguePath(context, "players;status=A;start=0;count=25"),
    },
    {
      id: "team_roster",
      label: "Team roster",
      method: "GET",
      requires: "team",
      path: (context) =>
        teamPath(
          context,
          context.week === null ? "roster" : `roster;week=${context.week}`,
        ),
    },
  ];

const EMPTY_RATE_LIMIT: YahooRateLimitObservation = {
  limit: null,
  remaining: null,
  reset: null,
  retryAfter: null,
};

function firstHeader(headers: Headers, names: string[]): string | null {
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) return value;
  }
  return null;
}

function rateLimitObservation(headers: Headers): YahooRateLimitObservation {
  return {
    limit: firstHeader(headers, ["x-ratelimit-limit", "x-rate-limit-limit"]),
    remaining: firstHeader(headers, [
      "x-ratelimit-remaining",
      "x-rate-limit-remaining",
    ]),
    reset: firstHeader(headers, ["x-ratelimit-reset", "x-rate-limit-reset"]),
    retryAfter: headers.get("retry-after"),
  };
}

function parseResponseBody(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

function collectValues(value: unknown, key: string, values: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectValues(entry, key, values));
    return;
  }
  if (value === null || typeof value !== "object") return;

  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (
      entryKey === key &&
      (typeof entryValue === "string" || typeof entryValue === "number")
    ) {
      values.push(String(entryValue));
    }
    collectValues(entryValue, key, values);
  }
}

function valuesForKey(value: unknown, key: string): string[] {
  if (typeof value === "string") {
    const expression = new RegExp(`<${key}>([^<]+)</${key}>`, "g");
    return [...value.matchAll(expression)]
      .map((match) => match[1]!)
      .filter(Boolean);
  }

  const values: string[] = [];
  collectValues(value, key, values);
  return [...new Set(values)];
}

function mostRecentResourceKey(
  keys: string[],
  marker: ".l." | ".t.",
): string | null {
  return (
    [...new Set(keys)]
      .filter((key) => key.includes(marker))
      .sort((left, right) => {
        const leftGame = Number(left.split(".")[0]);
        const rightGame = Number(right.split(".")[0]);
        if (Number.isFinite(leftGame) && Number.isFinite(rightGame)) {
          return rightGame - leftGame;
        }
        return right.localeCompare(left);
      })[0] ?? null
  );
}

function refreshRateSeconds(body: unknown): number | null {
  if (typeof body === "string") {
    const match = body.match(/refresh_rate=["'](\d+)["']/);
    return match ? Number(match[1]) : null;
  }
  const value = valuesForKey(body, "refresh_rate")[0];
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function statusForHttpStatus(status: number): YahooCapabilityProbeStatus {
  if (status >= 200 && status < 300) return "supported";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "error";
}

function detailForStatus(status: YahooCapabilityProbeStatus): string | null {
  switch (status) {
    case "supported":
      return null;
    case "unauthorized":
      return "Yahoo rejected or could not identify the OAuth credentials.";
    case "forbidden":
      return "The Yahoo application or user lacks permission for this resource.";
    case "not_found":
      return "Yahoo did not find this resource for the selected key.";
    case "rate_limited":
      return "Yahoo throttled the request; honor Retry-After and back off.";
    case "unavailable":
      return "Yahoo was temporarily unavailable.";
    case "error":
      return "Yahoo returned an unexpected non-success response.";
    case "not_tested":
      return null;
  }
}

type InternalProbeResult = {
  result: YahooCapabilityProbeResult;
  body: unknown;
};

function skippedResult(
  definition: YahooCapabilityDefinition,
  detail: string,
): InternalProbeResult {
  return {
    result: {
      capability: definition.id,
      label: definition.label,
      method: definition.method,
      url: null,
      status: "not_tested",
      httpStatus: null,
      latencyMs: null,
      contentType: null,
      providerRefreshRateSeconds: null,
      rateLimit: { ...EMPTY_RATE_LIMIT },
      detail,
    },
    body: null,
  };
}

export class YahooReadOnlyCapabilityProbe {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly clockMs: () => number = () => performance.now(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async run(input: {
    accessToken: string;
    leagueKey?: string | null;
    teamKey?: string | null;
    week?: number | null;
  }): Promise<YahooCapabilityReport> {
    const context: YahooProbeContext = {
      leagueKey: input.leagueKey ?? null,
      teamKey: input.teamKey ?? null,
      week: input.week ?? null,
    };
    const results: YahooCapabilityProbeResult[] = [];
    let requestCount = 0;

    for (const definition of YAHOO_READ_ONLY_CAPABILITIES) {
      let probe: InternalProbeResult;
      if (definition.requires === "league" && context.leagueKey === null) {
        probe = skippedResult(
          definition,
          "No league key was configured or discovered.",
        );
      } else if (definition.requires === "team" && context.teamKey === null) {
        probe = skippedResult(
          definition,
          "No team key was configured or discovered.",
        );
      } else {
        probe = await this.probe(definition, context, input.accessToken);
        requestCount += 1;
      }
      results.push(probe.result);

      if (
        context.leagueKey === null &&
        (definition.id === "current_leagues" ||
          definition.id === "league_history")
      ) {
        context.leagueKey = mostRecentResourceKey(
          valuesForKey(probe.body, "league_key"),
          ".l.",
        );
      }
      if (context.teamKey === null && definition.id === "league_teams") {
        context.teamKey = mostRecentResourceKey(
          valuesForKey(probe.body, "team_key"),
          ".t.",
        );
      }
    }

    return {
      observedAt: this.clock().toISOString(),
      selectedLeagueKey: context.leagueKey,
      selectedTeamKey: context.teamKey,
      week: context.week,
      requestCount,
      writeOperationsAttempted: 0,
      results,
    };
  }

  private async probe(
    definition: YahooCapabilityDefinition,
    context: YahooProbeContext,
    accessToken: string,
  ): Promise<InternalProbeResult> {
    const url = new URL(`${YAHOO_FANTASY_API_ROOT}${definition.path(context)}`);
    url.searchParams.set("format", "json");
    const startedAt = this.clockMs();

    try {
      const response = await this.fetcher(url, {
        method: definition.method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const latencyMs = Math.max(0, this.clockMs() - startedAt);
      const body = parseResponseBody(await response.text());
      const status = statusForHttpStatus(response.status);

      return {
        result: {
          capability: definition.id,
          label: definition.label,
          method: definition.method,
          url: url.toString(),
          status,
          httpStatus: response.status,
          latencyMs: Math.round(latencyMs * 10) / 10,
          contentType: response.headers.get("content-type"),
          providerRefreshRateSeconds: refreshRateSeconds(body),
          rateLimit: rateLimitObservation(response.headers),
          detail: detailForStatus(status),
        },
        body,
      };
    } catch (error) {
      const latencyMs = Math.max(0, this.clockMs() - startedAt);
      return {
        result: {
          capability: definition.id,
          label: definition.label,
          method: definition.method,
          url: url.toString(),
          status: "unavailable",
          httpStatus: null,
          latencyMs: Math.round(latencyMs * 10) / 10,
          contentType: null,
          providerRefreshRateSeconds: null,
          rateLimit: { ...EMPTY_RATE_LIMIT },
          detail: error instanceof Error ? error.message : String(error),
        },
        body: null,
      };
    }
  }
}
