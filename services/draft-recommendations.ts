import { getLatestConsensusSnapshotForLeague } from "@/db/repositories/projection-consensus";
import {
  getLatestFantasyProsDraftData,
  type FantasyProsDraftData,
} from "@/db/repositories/draft-signals";
import {
  type DraftAssistantResult,
  type DraftRecommendationCandidate,
  recommendDraftPlayers,
} from "@/domain/draft-recommendation";
import {
  type DraftPick,
  type DraftPlayer,
  type DraftSession,
  draftPickCoordinates,
} from "@/domain/draft";
import type { LeagueConfiguration } from "@/domain/league-configuration";
import type { PlayerPosition } from "@/domain/player";
import type { RosterAssignment } from "@/domain/roster";
import { generateProjectionConsensus } from "@/services/projection-consensus";

type ConsensusSnapshot = Awaited<
  ReturnType<typeof getLatestConsensusSnapshotForLeague>
>;

function nextUserPick(
  currentOverallPick: number,
  totalPicks: number,
  league: LeagueConfiguration,
): number {
  for (let pick = currentOverallPick; pick <= totalPicks; pick += 1) {
    if (
      draftPickCoordinates(pick, league.teamCount, league.draftType)
        .fantasyTeamSlot === league.draftPosition
    ) {
      return pick;
    }
  }
  return currentOverallPick;
}

function sameTeamName(left: string | undefined, right: string): boolean {
  return left?.trim().toLowerCase() === right.trim().toLowerCase();
}

function rosterPositionCounts(input: {
  picks: DraftPick[];
  keepers: RosterAssignment[];
  league: LeagueConfiguration;
  session: DraftSession;
}): Partial<Record<PlayerPosition, number>> {
  const positions: PlayerPosition[] = input.picks
    .filter((pick) => pick.fantasyTeamSlot === input.league.draftPosition)
    .map((pick) => pick.position as PlayerPosition);
  const myTeamName =
    input.session.teamNames[String(input.league.draftPosition)];
  if (myTeamName) {
    positions.push(
      ...input.keepers
        .filter((keeper) => sameTeamName(myTeamName, keeper.fantasyTeamName))
        .map((keeper) => keeper.position),
    );
  }
  return positions.reduce<Partial<Record<PlayerPosition, number>>>(
    (counts, position) => ({
      ...counts,
      [position]: (counts[position] ?? 0) + 1,
    }),
    {},
  );
}

async function projectionSnapshot(input: {
  league: LeagueConfiguration;
  session: DraftSession;
}): Promise<ConsensusSnapshot> {
  const scope = {
    leagueConfigurationId: input.league.id,
    season: input.session.season,
    week: null,
    horizon: "preseason" as const,
  };
  const existing = await getLatestConsensusSnapshotForLeague(scope);
  if (existing) return existing;
  try {
    return await generateProjectionConsensus({
      leagueId: input.league.id,
      userId: input.league.userId,
      season: input.session.season,
      week: null,
      horizon: "preseason",
    });
  } catch {
    return null;
  }
}

export function buildDraftAssistant(input: {
  league: LeagueConfiguration;
  session: DraftSession;
  availablePlayers: DraftPlayer[];
  picks: DraftPick[];
  keepers: RosterAssignment[];
  consensus: NonNullable<ConsensusSnapshot> | null;
  fantasyProsData?: FantasyProsDraftData | null;
}): DraftAssistantResult {
  const projectionByPlayer = new Map(
    input.consensus?.entries.map((entry) => [entry.playerId, entry]) ?? [],
  );
  const fantasyProsByPlayer = new Map(
    input.fantasyProsData?.signals.map((signal) => [signal.playerId, signal]) ??
      [],
  );
  const candidates: DraftRecommendationCandidate[] = input.availablePlayers.map(
    (player) => {
      const projection = projectionByPlayer.get(player.id);
      const fantasyPros = fantasyProsByPlayer.get(player.id);
      const injuryStatus = fantasyPros?.injuryStatus;
      return {
        playerId: player.id,
        fullName: player.fullName,
        position: player.position,
        nflTeam: player.nflTeam,
        status:
          injuryStatus && injuryStatus !== "unknown"
            ? injuryStatus
            : player.status,
        yahooRank: player.yahooRank,
        yahooAdp: player.yahooAdp,
        fantasyProsRank: fantasyPros?.rank ?? null,
        fantasyProsPositionRank: fantasyPros?.positionRank ?? null,
        fantasyProsTier: fantasyPros?.tier ?? null,
        fantasyProsAdp: fantasyPros?.adp ?? null,
        fantasyProsExpertCount: fantasyPros?.expertCount ?? null,
        fantasyProsInjuryDetails: fantasyPros?.injuryDetails ?? null,
        fantasyProsNewsHeadline: fantasyPros?.newsHeadline ?? null,
        fantasyProsNewsSummary: fantasyPros?.newsSummary ?? null,
        fantasyProsNewsPublishedAt: fantasyPros?.newsPublishedAt ?? null,
        consensusPoints: projection?.consensusPoints ?? null,
        confidence: projection?.confidence ?? null,
        sourceCount: projection?.sourceCount ?? 0,
      };
    },
  );
  const currentOverallPick = input.picks.length + 1;
  const rounds = Object.values(input.league.rosterSlots).reduce(
    (total, count) => total + count,
    0,
  );
  const totalPicks = rounds * input.league.teamCount;
  return recommendDraftPlayers({
    candidates,
    league: input.league,
    rosterPositionCounts: rosterPositionCounts(input),
    currentOverallPick,
    nextUserOverallPick: nextUserPick(
      currentOverallPick,
      totalPicks,
      input.league,
    ),
  });
}

export async function loadDraftAssistant(input: {
  league: LeagueConfiguration;
  session: DraftSession;
  availablePlayers: DraftPlayer[];
  picks: DraftPick[];
  keepers: RosterAssignment[];
}): Promise<DraftAssistantResult> {
  const [consensus, fantasyProsData] = await Promise.all([
    projectionSnapshot(input),
    getLatestFantasyProsDraftData(input.session.season),
  ]);
  return buildDraftAssistant({
    ...input,
    consensus,
    fantasyProsData,
  });
}
