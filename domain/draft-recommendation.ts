import type { LeagueConfiguration } from "@/domain/league-configuration";
import type { PlayerPosition, PlayerStatus } from "@/domain/player";

export const DRAFT_RECOMMENDATION_VERSION = "draft-recommendation-v2";

export type DraftRecommendationCandidate = {
  playerId: string;
  fullName: string;
  position: PlayerPosition;
  nflTeam: string | null;
  status: PlayerStatus;
  yahooRank: number | null;
  yahooAdp: number | null;
  fantasyProsRank: number | null;
  fantasyProsPositionRank: number | null;
  fantasyProsTier: number | null;
  fantasyProsAdp: number | null;
  fantasyProsExpertCount: number | null;
  fantasyProsInjuryDetails: string | null;
  fantasyProsNewsHeadline: string | null;
  fantasyProsNewsSummary: string | null;
  fantasyProsNewsPublishedAt: Date | null;
  consensusPoints: number | null;
  confidence: number | null;
  sourceCount: number;
};

export type DraftRecommendationFactors = {
  projectedValue: number;
  scarcity: number;
  availabilityRisk: number;
  rosterFit: number;
  confidence: number;
  injuryPenalty: number;
};

export type DraftRecommendation = DraftRecommendationCandidate & {
  rank: number;
  score: number;
  replacementPoints: number | null;
  valueAboveReplacement: number | null;
  tierDrop: number | null;
  factors: DraftRecommendationFactors;
  reasons: string[];
  warning: string | null;
};

export type DraftAssistantResult = {
  version: typeof DRAFT_RECOMMENDATION_VERSION;
  dataMode: "projection_consensus" | "fantasypros_market" | "market_only";
  currentOverallPick: number;
  nextUserOverallPick: number;
  picksUntilUser: number;
  recommendations: DraftRecommendation[];
};

type PositionCounts = Partial<Record<PlayerPosition, number>>;

type ScoredCandidate = DraftRecommendationCandidate & {
  marketPick: number;
  replacementPoints: number | null;
  valueAboveReplacement: number | null;
  tierDrop: number | null;
  projectedValueRaw: number;
  scarcityRaw: number;
};

const POSITIONS: PlayerPosition[] = ["QB", "RB", "WR", "TE", "K", "DST"];

function round(value: number, places = 1): number {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalize(value: number, minimum: number, maximum: number): number {
  if (maximum <= minimum) return value > 0 ? 100 : 0;
  return clamp(((value - minimum) / (maximum - minimum)) * 100);
}

function marketPick(candidate: DraftRecommendationCandidate): number {
  const signals = [
    candidate.fantasyProsRank,
    candidate.fantasyProsAdp,
    candidate.yahooRank,
    candidate.yahooAdp,
  ].filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  return signals.length
    ? signals.reduce((total, value) => total + value, 0) / signals.length
    : 999;
}

function replacementDemand(
  position: PlayerPosition,
  league: LeagueConfiguration,
): number {
  const slots = league.rosterSlots;
  const perTeam =
    position === "QB"
      ? slots.qb + slots.superflex
      : position === "RB"
        ? slots.rb + slots.flex * 0.4
        : position === "WR"
          ? slots.wr + slots.flex * 0.45
          : position === "TE"
            ? slots.te + slots.flex * 0.15
            : position === "K"
              ? slots.k
              : slots.dst;
  return Math.max(1, Math.ceil(perTeam * league.teamCount));
}

function rosterFit(
  position: PlayerPosition,
  counts: PositionCounts,
  league: LeagueConfiguration,
  currentOverallPick: number,
): number {
  const slots = league.rosterSlots;
  const direct = {
    QB: slots.qb,
    RB: slots.rb,
    WR: slots.wr,
    TE: slots.te,
    K: slots.k,
    DST: slots.dst,
  } satisfies Record<PlayerPosition, number>;
  const current = counts[position] ?? 0;
  const round = Math.ceil(currentOverallPick / league.teamCount);
  const totalRounds = Object.values(slots).reduce(
    (total, count) => total + count,
    0,
  );

  if ((position === "K" || position === "DST") && round < totalRounds - 2) {
    return current < direct[position] ? 25 : 5;
  }
  if (current < direct[position]) return 100;

  if (position === "QB" && current < direct.QB + slots.superflex) return 82;
  if (position === "RB" || position === "WR" || position === "TE") {
    const flexPlayers =
      Math.max(0, (counts.RB ?? 0) - direct.RB) +
      Math.max(0, (counts.WR ?? 0) - direct.WR) +
      Math.max(0, (counts.TE ?? 0) - direct.TE);
    if (flexPlayers < slots.flex) return 75;
  }
  return 45;
}

function injuryPenalty(status: PlayerStatus): number {
  if (status === "out" || status === "injured_reserve") return 35;
  if (status === "doubtful" || status === "physically_unable_to_perform") {
    return 25;
  }
  if (status === "suspended") return 20;
  if (status === "questionable" || status === "unknown") return 6;
  return 0;
}

function injuryWarning(status: PlayerStatus): string | null {
  if (status === "active") return null;
  if (status === "unknown") return "Current player status is not confirmed.";
  return `Player status is ${status.replaceAll("_", " ")}.`;
}

function recommendationWarning(
  candidate: DraftRecommendationCandidate,
): string | null {
  const status = injuryWarning(candidate.status);
  if (status && candidate.fantasyProsInjuryDetails) {
    return `${status} FantasyPros: ${candidate.fantasyProsInjuryDetails}`;
  }
  return status;
}

function availabilityRisk(expectedPick: number, nextUserPick: number): number {
  if (expectedPick >= 999) return 35;
  return clamp(100 / (1 + Math.exp(-(nextUserPick - expectedPick) / 6)));
}

function buildReasons(
  candidate: ScoredCandidate,
  factors: DraftRecommendationFactors,
): string[] {
  const reasons: string[] = [];
  if (factors.rosterFit >= 90) {
    reasons.push(`Fills an open starting ${candidate.position} slot.`);
  } else if (factors.rosterFit >= 70) {
    reasons.push(`Fits an open FLEX or SUPERFLEX need.`);
  }
  if (
    candidate.valueAboveReplacement !== null &&
    candidate.valueAboveReplacement > 0
  ) {
    reasons.push(
      `${round(candidate.valueAboveReplacement)} projected points above the ${candidate.position} replacement baseline.`,
    );
  }
  if (candidate.tierDrop !== null && candidate.tierDrop >= 1) {
    reasons.push(
      `${candidate.position} value drops ${round(candidate.tierDrop)} projected points behind this option.`,
    );
  }
  if (factors.availabilityRisk >= 65) {
    reasons.push(
      `${Math.round(factors.availabilityRisk)}% estimated chance to be gone by your next pick.`,
    );
  }
  if (candidate.fantasyProsRank !== null) {
    const tier = candidate.fantasyProsTier
      ? ` in tier ${candidate.fantasyProsTier}`
      : "";
    reasons.push(
      `FantasyPros ECR ${candidate.fantasyProsRank}${tier} supports the value.`,
    );
  }
  if (
    candidate.consensusPoints === null &&
    candidate.fantasyProsRank === null &&
    candidate.fantasyProsAdp === null
  ) {
    const rank = candidate.yahooRank
      ? `Yahoo rank ${candidate.yahooRank}`
      : "Yahoo market order";
    const adp = candidate.yahooAdp ? ` and ADP ${candidate.yahooAdp}` : "";
    reasons.push(`${rank}${adp} drive this market-only recommendation.`);
  } else if (candidate.consensusPoints === null) {
    reasons.push(
      "FantasyPros expert value and market ADP are blended with Yahoo availability.",
    );
  }
  if (reasons.length === 0) {
    reasons.push("Best remaining combination of market value and roster fit.");
  }
  return reasons.slice(0, 3);
}

/**
 * Deterministically rank the active draft pool for the user's next selection.
 * Every output score includes its component factors so the UI never needs to
 * invent a reason for the ordering.
 */
export function recommendDraftPlayers(input: {
  candidates: DraftRecommendationCandidate[];
  league: LeagueConfiguration;
  rosterPositionCounts: PositionCounts;
  currentOverallPick: number;
  nextUserOverallPick: number;
  limit?: number;
}): DraftAssistantResult {
  const candidates = input.candidates.filter(
    (candidate) =>
      candidate.status !== "inactive" && candidate.status !== "retired",
  );
  const byPosition = new Map<PlayerPosition, DraftRecommendationCandidate[]>();
  for (const position of POSITIONS) {
    byPosition.set(
      position,
      candidates
        .filter((candidate) => candidate.position === position)
        .sort((left, right) => {
          if (
            left.consensusPoints !== null &&
            right.consensusPoints !== null &&
            left.consensusPoints !== right.consensusPoints
          ) {
            return right.consensusPoints - left.consensusPoints;
          }
          return marketPick(left) - marketPick(right);
        }),
    );
  }

  const scored: ScoredCandidate[] = candidates.map((candidate) => {
    const peers = byPosition.get(candidate.position) ?? [];
    const peerIndex = peers.findIndex(
      (peer) => peer.playerId === candidate.playerId,
    );
    const replacement =
      peers[replacementDemand(candidate.position, input.league) - 1];
    const replacementPoints = replacement?.consensusPoints ?? null;
    const valueAboveReplacement =
      candidate.consensusPoints !== null && replacementPoints !== null
        ? candidate.consensusPoints - replacementPoints
        : null;
    const nextPeer = peers[peerIndex + 1];
    const tierDrop =
      candidate.consensusPoints !== null &&
      nextPeer !== undefined &&
      nextPeer.consensusPoints !== null
        ? Math.max(0, candidate.consensusPoints - nextPeer.consensusPoints)
        : null;
    const expectedPick = marketPick(candidate);
    return {
      ...candidate,
      marketPick: expectedPick,
      replacementPoints,
      valueAboveReplacement,
      tierDrop,
      projectedValueRaw:
        valueAboveReplacement ?? Math.max(0, 300 - expectedPick),
      scarcityRaw:
        tierDrop ??
        Math.max(
          candidate.fantasyProsTier !== null &&
            nextPeer?.fantasyProsTier !== null &&
            nextPeer?.fantasyProsTier !== undefined
            ? (nextPeer.fantasyProsTier - candidate.fantasyProsTier) * 15
            : 0,
          nextPeer ? marketPick(nextPeer) - expectedPick : 0,
        ),
    };
  });

  const valueRange = scored.map((candidate) => candidate.projectedValueRaw);
  const scarcityRange = scored.map((candidate) => candidate.scarcityRaw);
  const minimumValue = Math.min(...valueRange, 0);
  const maximumValue = Math.max(...valueRange, 0);
  const minimumScarcity = Math.min(...scarcityRange, 0);
  const maximumScarcity = Math.max(...scarcityRange, 0);

  const ranked = scored
    .map((candidate) => {
      const factors: DraftRecommendationFactors = {
        projectedValue: round(
          normalize(candidate.projectedValueRaw, minimumValue, maximumValue),
        ),
        scarcity: round(
          normalize(candidate.scarcityRaw, minimumScarcity, maximumScarcity),
        ),
        availabilityRisk: round(
          availabilityRisk(candidate.marketPick, input.nextUserOverallPick),
        ),
        rosterFit: rosterFit(
          candidate.position,
          input.rosterPositionCounts,
          input.league,
          input.currentOverallPick,
        ),
        confidence: round(
          (candidate.confidence ??
            (candidate.fantasyProsExpertCount
              ? Math.min(0.75, 0.45 + candidate.fantasyProsExpertCount / 500)
              : 0.35)) * 100,
        ),
        injuryPenalty: injuryPenalty(candidate.status),
      };
      const score = round(
        clamp(
          factors.projectedValue * 0.4 +
            factors.scarcity * 0.2 +
            factors.availabilityRisk * 0.2 +
            factors.rosterFit * 0.15 +
            factors.confidence * 0.05 -
            factors.injuryPenalty,
        ),
      );
      return {
        ...candidate,
        rank: 0,
        score,
        factors,
        reasons: buildReasons(candidate, factors),
        warning: recommendationWarning(candidate),
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.marketPick - right.marketPick ||
        left.fullName.localeCompare(right.fullName),
    )
    .slice(0, input.limit ?? 5)
    .map((recommendation, index): DraftRecommendation => {
      const {
        marketPick: _marketPick,
        projectedValueRaw: _value,
        scarcityRaw: _scarcity,
        ...result
      } = recommendation;
      void _marketPick;
      void _value;
      void _scarcity;
      return { ...result, rank: index + 1 };
    });

  return {
    version: DRAFT_RECOMMENDATION_VERSION,
    dataMode: candidates.some((candidate) => candidate.consensusPoints !== null)
      ? "projection_consensus"
      : candidates.some(
            (candidate) =>
              candidate.fantasyProsRank !== null ||
              candidate.fantasyProsAdp !== null ||
              candidate.fantasyProsInjuryDetails !== null ||
              candidate.fantasyProsNewsHeadline !== null,
          )
        ? "fantasypros_market"
        : "market_only",
    currentOverallPick: input.currentOverallPick,
    nextUserOverallPick: input.nextUserOverallPick,
    picksUntilUser: Math.max(
      0,
      input.nextUserOverallPick - input.currentOverallPick,
    ),
    recommendations: ranked,
  };
}
