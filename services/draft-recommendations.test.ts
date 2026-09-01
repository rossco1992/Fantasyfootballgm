import { describe, expect, it } from "vitest";

import type { PersistedConsensusSnapshot } from "@/db/repositories/projection-consensus";
import { DEFAULT_LEAGUE_CONFIGURATION } from "@/domain/league-configuration";
import { buildDraftAssistant } from "@/services/draft-recommendations";

const leagueId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const playerId = "44444444-4444-4444-8444-444444444444";

describe("draft recommendation service", () => {
  it("uses the live pick order, user's roster, keepers, and consensus data", () => {
    const consensus: PersistedConsensusSnapshot = {
      id: "55555555-5555-4555-8555-555555555555",
      leagueConfigurationId: leagueId,
      season: 2026,
      week: null,
      horizon: "preseason",
      scoring: "half_ppr",
      weightingConfig: { version: "test", providers: {} },
      weightingVersion: "test",
      calculationVersion: "test",
      sourceSnapshotIds: [],
      inputFingerprint: "a".repeat(64),
      generatedAt: new Date("2026-08-30T12:00:00Z"),
      entries: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          consensusSnapshotId: "55555555-5555-4555-8555-555555555555",
          playerId,
          position: "RB",
          consensusPoints: 260,
          lowPoints: 240,
          highPoints: 280,
          rangePoints: 40,
          standardDeviation: 10,
          confidence: 0.8,
          sourceCount: 2,
          groupCount: 1,
          components: [],
        },
      ],
    };
    const result = buildDraftAssistant({
      league: {
        ...DEFAULT_LEAGUE_CONFIGURATION,
        id: leagueId,
        userId,
        teamCount: 12,
        draftPosition: 3,
        scoringPreset: "half_ppr",
        createdAt: new Date("2026-08-30T12:00:00Z"),
        updatedAt: new Date("2026-08-30T12:00:00Z"),
      },
      session: {
        id: sessionId,
        leagueId,
        season: 2026,
        status: "active",
        teamNames: { "3": "Ross" },
        playerPoolSnapshotId: "77777777-7777-4777-8777-777777777777",
        createdAt: new Date("2026-08-30T12:00:00Z"),
        updatedAt: new Date("2026-08-30T12:00:00Z"),
      },
      availablePlayers: [
        {
          id: playerId,
          fullName: "Recommended Runner",
          position: "RB",
          nflTeam: "SF",
          byeWeek: 9,
          status: "active",
          yahooRank: 5,
          yahooAdp: 6,
          createdAt: new Date("2026-08-30T12:00:00Z"),
          updatedAt: new Date("2026-08-30T12:00:00Z"),
        },
      ],
      picks: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          sessionId,
          playerId: "99999999-9999-4999-8999-999999999999",
          fullName: "First Pick",
          position: "WR",
          nflTeam: "NYJ",
          overallPick: 1,
          round: 1,
          pickInRound: 1,
          fantasyTeamSlot: 1,
          createdAt: new Date("2026-08-30T12:00:00Z"),
        },
      ],
      keepers: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          leagueId,
          playerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          fullName: "Ross Keeper",
          position: "WR",
          nflTeam: "DAL",
          playerStatus: "active",
          fantasyTeamName: "Ross",
          acquisitionType: "drafted",
          isKeeper: true,
          originalDraftSeason: 2025,
          originalDraftRound: 4,
          keeperSeason: 2026,
          keeperCostRound: 4,
          createdAt: new Date("2026-08-30T12:00:00Z"),
          updatedAt: new Date("2026-08-30T12:00:00Z"),
        },
      ],
      consensus,
      fantasyProsData: {
        snapshotId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        observedAt: new Date("2026-08-30T13:00:00Z"),
        coverage: [],
        signals: [
          {
            playerId,
            rank: 4,
            positionRank: 2,
            tier: 1,
            expertCount: 120,
            adp: 5,
            injuryStatus: "active",
            injuryDetails: null,
            newsHeadline: "Ready for Week 1",
            newsSummary: "Expected to handle a full workload.",
            newsPublishedAt: new Date("2026-08-30T12:30:00Z"),
          },
        ],
      },
    });

    expect(result).toMatchObject({
      dataMode: "projection_consensus",
      currentOverallPick: 2,
      nextUserOverallPick: 3,
      picksUntilUser: 1,
    });
    expect(result.recommendations[0]).toMatchObject({
      playerId,
      consensusPoints: 260,
      sourceCount: 2,
      fantasyProsRank: 4,
      fantasyProsTier: 1,
      fantasyProsNewsHeadline: "Ready for Week 1",
    });
  });
});
