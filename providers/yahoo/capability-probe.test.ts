import { describe, expect, it, vi } from "vitest";

import {
  YAHOO_READ_ONLY_CAPABILITIES,
  YahooReadOnlyCapabilityProbe,
} from "@/providers/yahoo/capability-probe";

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("Yahoo read-only capability probe", () => {
  it("contains only documented GET capabilities", () => {
    expect(
      new Set(YAHOO_READ_ONLY_CAPABILITIES.map(({ method }) => method)),
    ).toEqual(new Set(["GET"]));
    expect(YAHOO_READ_ONLY_CAPABILITIES.map(({ id }) => id)).toEqual([
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
    ]);
  });

  it("discovers league and team keys before probing every read capability", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (
        url.includes("games%3Bgame_keys") ||
        url.includes("games;game_keys")
      ) {
        return jsonResponse({
          fantasy_content: {
            refresh_rate: "60",
            league_key: "461.l.2026",
          },
        });
      }
      if (url.includes("/teams?")) {
        return jsonResponse({
          fantasy_content: { team_key: "461.l.2026.t.4" },
        });
      }
      return jsonResponse({ fantasy_content: { refresh_rate: 60 } });
    }) as unknown as typeof fetch;
    let time = 0;
    const probe = new YahooReadOnlyCapabilityProbe(
      fetcher,
      () => (time += 12.5),
      () => new Date("2026-08-23T12:00:00.000Z"),
    );

    const report = await probe.run({
      accessToken: "access-token",
      week: 2,
    });

    expect(report).toMatchObject({
      observedAt: "2026-08-23T12:00:00.000Z",
      selectedLeagueKey: "461.l.2026",
      selectedTeamKey: "461.l.2026.t.4",
      week: 2,
      requestCount: 10,
      writeOperationsAttempted: 0,
    });
    expect(report.results).toHaveLength(10);
    expect(report.results.every(({ status }) => status === "supported")).toBe(
      true,
    );
    expect(
      report.results.find(({ capability }) => capability === "team_roster")
        ?.url,
    ).toContain("roster;week=2");
    expect(report.results[0]).toMatchObject({
      latencyMs: 12.5,
      contentType: "application/json",
      providerRefreshRateSeconds: 60,
    });

    for (const [, init] of vi.mocked(fetcher).mock.calls) {
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer access-token",
      );
    }
  });

  it("does not guess private resource keys after OAuth is rejected", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ error: { description: "Unauthorized" } }, 401),
    ) as unknown as typeof fetch;
    const probe = new YahooReadOnlyCapabilityProbe(fetcher);

    const report = await probe.run({ accessToken: "invalid-token" });

    expect(report.requestCount).toBe(2);
    expect(report.results.slice(0, 2).map(({ status }) => status)).toEqual([
      "unauthorized",
      "unauthorized",
    ]);
    expect(
      report.results.slice(2).every(({ status }) => status === "not_tested"),
    ).toBe(true);
    expect(report.selectedLeagueKey).toBeNull();
  });

  it("captures throttling evidence without retrying aggressively", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/transactions?")) {
        return jsonResponse(
          { error: { description: "Too many requests" } },
          429,
          {
            "retry-after": "60",
            "x-ratelimit-limit": "120",
            "x-ratelimit-remaining": "0",
          },
        );
      }
      return jsonResponse({ fantasy_content: {} });
    }) as unknown as typeof fetch;
    const probe = new YahooReadOnlyCapabilityProbe(fetcher);

    const report = await probe.run({
      accessToken: "access-token",
      leagueKey: "461.l.2026",
      teamKey: "461.l.2026.t.4",
    });
    const transactions = report.results.find(
      ({ capability }) => capability === "league_transactions",
    );

    expect(transactions).toMatchObject({
      status: "rate_limited",
      httpStatus: 429,
      rateLimit: {
        limit: "120",
        remaining: "0",
        retryAfter: "60",
      },
    });
    expect(
      report.results.filter(
        ({ capability }) => capability === "league_transactions",
      ),
    ).toHaveLength(1);
  });
});
