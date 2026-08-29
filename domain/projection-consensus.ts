import { z } from "zod";

import { SCORING_PRESETS } from "@/domain/league-configuration";
import { PLAYER_POSITIONS } from "@/domain/player";

export const PROJECTION_HORIZONS = [
  "preseason",
  "weekly",
  "rest_of_season",
] as const;

export const CONSENSUS_CALCULATION_VERSION = "projection-consensus-v1";

export const projectionHorizonSchema = z.enum(PROJECTION_HORIZONS);
export const consensusScoringSchema = z.enum(SCORING_PRESETS);

export const projectionWeightingProviderSchema = z.object({
  weight: z.number().finite().positive(),
  sourceFamily: z.string().trim().min(1).max(80),
  correlationGroup: z.string().trim().min(1).max(80),
});

export const projectionWeightingConfigSchema = z.object({
  version: z.string().trim().min(1).max(120),
  providers: z.record(
    z.string().trim().min(1).max(80),
    projectionWeightingProviderSchema,
  ),
});

export type ProjectionWeightingConfig = z.infer<
  typeof projectionWeightingConfigSchema
>;
export type ProjectionHorizon = z.infer<typeof projectionHorizonSchema>;
export type ConsensusScoring = z.infer<typeof consensusScoringSchema>;

export type ProjectionSource = {
  providerId: string;
  providerSlug: string;
  snapshotId: string;
  observedAt: Date;
  projectedPoints: number | null;
  scoring: ConsensusScoring | null;
  stats: Record<string, number>;
  weight: number;
  sourceFamily: string;
  correlationGroup: string;
};

export const projectionConsensusComponentSchema = z.object({
  providerId: z.string().uuid(),
  providerSlug: z.string().trim().min(1).max(80),
  snapshotId: z.string().uuid(),
  observedAt: z.coerce.date(),
  sourceFamily: z.string().trim().min(1).max(80),
  correlationGroup: z.string().trim().min(1).max(80),
  configuredWeight: z.number().finite().positive(),
  effectiveWeight: z.number().finite().min(0).max(1),
  projectedPoints: z.number().finite(),
  pointsOrigin: z.enum(["recalculated_stats", "provider_total"]),
  scoredStats: z.array(z.string().trim().min(1).max(80)),
});

export type ProjectionConsensusComponent = z.infer<
  typeof projectionConsensusComponentSchema
>;

export type PlayerProjectionConsensus = {
  playerId: string;
  position: (typeof PLAYER_POSITIONS)[number];
  consensusPoints: number;
  lowPoints: number;
  highPoints: number;
  rangePoints: number;
  standardDeviation: number;
  confidence: number;
  sourceCount: number;
  groupCount: number;
  components: ProjectionConsensusComponent[];
};

export type ProjectionAccuracyRecord = {
  sourceType: "provider" | "consensus";
  providerSlug: string | null;
  predictedPoints: number;
  actualPoints: number;
  signedError: number;
  absoluteError: number;
  squaredError: number;
};

const SCORING_FACTORS = {
  passingYards: 0.04,
  passingTouchdowns: 4,
  passingInterceptions: -2,
  rushingYards: 0.1,
  rushingTouchdowns: 6,
  receivingYards: 0.1,
  receivingTouchdowns: 6,
  fumblesLost: -2,
  twoPointConversions: 2,
  extraPointsMade: 1,
  fieldGoalsMade: 3,
  fieldGoalsMade0To39: 3,
  fieldGoalsMade40To49: 4,
  fieldGoalsMade50Plus: 5,
  defenseSacks: 1,
  defenseInterceptions: 2,
  defenseFumbleRecoveries: 2,
  defenseTouchdowns: 6,
  defenseSafeties: 2,
  defenseBlockedKicks: 2,
  defenseReturnTouchdowns: 6,
} as const;

function round(value: number, places = 4): number {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

/**
 * Re-score a provider's normalized stat line under the league preset. The
 * provider total remains available as a fallback only when no scorable stat
 * line exists and it already matches the requested scoring format.
 */
export function calculateFantasyPoints(
  stats: Record<string, number>,
  scoring: ConsensusScoring,
): { points: number; scoredStats: string[] } | null {
  const scoredStats: string[] = [];
  let points = 0;

  for (const [stat, factor] of Object.entries(SCORING_FACTORS)) {
    if (
      stat === "fieldGoalsMade" &&
      [
        "fieldGoalsMade0To39",
        "fieldGoalsMade40To49",
        "fieldGoalsMade50Plus",
      ].some((split) => stats[split] !== undefined)
    ) {
      continue;
    }
    const value = stats[stat];
    if (value === undefined || !Number.isFinite(value)) continue;
    points += value * factor;
    scoredStats.push(stat);
  }

  const receptions = stats.receptions;
  if (receptions !== undefined && Number.isFinite(receptions)) {
    points +=
      receptions * (scoring === "ppr" ? 1 : scoring === "half_ppr" ? 0.5 : 0);
    scoredStats.push("receptions");
  }

  if (scoredStats.length === 0) return null;
  return {
    points: round(points),
    scoredStats: [...new Set(scoredStats)].sort(),
  };
}

export function resolveProjectionPoints(
  source: Pick<ProjectionSource, "projectedPoints" | "scoring" | "stats">,
  targetScoring: ConsensusScoring,
): {
  points: number;
  origin: ProjectionConsensusComponent["pointsOrigin"];
  scoredStats: string[];
} | null {
  const recalculated = calculateFantasyPoints(source.stats, targetScoring);
  if (recalculated) {
    return {
      points: recalculated.points,
      origin: "recalculated_stats",
      scoredStats: recalculated.scoredStats,
    };
  }
  if (
    source.projectedPoints !== null &&
    Number.isFinite(source.projectedPoints) &&
    source.scoring === targetScoring
  ) {
    return {
      points: round(source.projectedPoints),
      origin: "provider_total",
      scoredStats: [],
    };
  }
  return null;
}

/**
 * Blend sources in two stages. Sources within one correlation group are first
 * averaged, then each group receives one vote. This prevents two closely
 * related consensus products from overpowering an independent model merely
 * because the group contains more feeds.
 */
export function blendProjectionSources(input: {
  playerId: string;
  position: PlayerProjectionConsensus["position"];
  scoring: ConsensusScoring;
  sources: ProjectionSource[];
}): PlayerProjectionConsensus | null {
  const usable = input.sources.flatMap((source) => {
    const resolved = resolveProjectionPoints(source, input.scoring);
    return resolved ? [{ source, resolved }] : [];
  });
  if (usable.length === 0) return null;

  const grouped = new Map<string, typeof usable>();
  for (const entry of usable) {
    const group = grouped.get(entry.source.correlationGroup) ?? [];
    group.push(entry);
    grouped.set(entry.source.correlationGroup, group);
  }

  const groupWeights = new Map<string, number>();
  for (const [groupName, entries] of grouped) {
    groupWeights.set(
      groupName,
      Math.max(...entries.map((entry) => entry.source.weight)),
    );
  }
  const totalGroupWeight = [...groupWeights.values()].reduce(
    (total, weight) => total + weight,
    0,
  );

  const components: ProjectionConsensusComponent[] = [];
  for (const [groupName, entries] of grouped) {
    const sourceWeightTotal = entries.reduce(
      (total, entry) => total + entry.source.weight,
      0,
    );
    const groupWeight = groupWeights.get(groupName) ?? 0;
    for (const { source, resolved } of entries) {
      const withinGroupWeight = source.weight / sourceWeightTotal;
      const effectiveWeight =
        (groupWeight / totalGroupWeight) * withinGroupWeight;
      components.push({
        providerId: source.providerId,
        providerSlug: source.providerSlug,
        snapshotId: source.snapshotId,
        observedAt: source.observedAt,
        sourceFamily: source.sourceFamily,
        correlationGroup: source.correlationGroup,
        configuredWeight: source.weight,
        effectiveWeight: round(effectiveWeight, 8),
        projectedPoints: resolved.points,
        pointsOrigin: resolved.origin,
        scoredStats: resolved.scoredStats,
      });
    }
  }
  components.sort((left, right) =>
    left.providerSlug.localeCompare(right.providerSlug),
  );

  const consensusPoints = components.reduce(
    (total, component) =>
      total + component.projectedPoints * component.effectiveWeight,
    0,
  );
  const lowPoints = Math.min(
    ...components.map((component) => component.projectedPoints),
  );
  const highPoints = Math.max(
    ...components.map((component) => component.projectedPoints),
  );
  const variance = components.reduce(
    (total, component) =>
      total +
      component.effectiveWeight *
        (component.projectedPoints - consensusPoints) ** 2,
    0,
  );
  const standardDeviation = Math.sqrt(variance);
  const agreement =
    1 - Math.min(standardDeviation / Math.max(Math.abs(consensusPoints), 1), 1);
  const coverage = Math.min(components.length / 3, 1);
  const confidence = Math.max(0, Math.min(1, agreement * 0.7 + coverage * 0.3));

  return {
    playerId: input.playerId,
    position: input.position,
    consensusPoints: round(consensusPoints),
    lowPoints: round(lowPoints),
    highPoints: round(highPoints),
    rangePoints: round(highPoints - lowPoints),
    standardDeviation: round(standardDeviation),
    confidence: round(confidence),
    sourceCount: components.length,
    groupCount: grouped.size,
    components,
  };
}

export function evaluateProjectionAccuracy(
  consensus: PlayerProjectionConsensus,
  actualPoints: number,
): ProjectionAccuracyRecord[] {
  const records: ProjectionAccuracyRecord[] = [
    {
      sourceType: "consensus",
      providerSlug: null,
      predictedPoints: consensus.consensusPoints,
      actualPoints,
      signedError: consensus.consensusPoints - actualPoints,
      absoluteError: Math.abs(consensus.consensusPoints - actualPoints),
      squaredError: (consensus.consensusPoints - actualPoints) ** 2,
    },
    ...consensus.components.map((component) => ({
      sourceType: "provider" as const,
      providerSlug: component.providerSlug,
      predictedPoints: component.projectedPoints,
      actualPoints,
      signedError: component.projectedPoints - actualPoints,
      absoluteError: Math.abs(component.projectedPoints - actualPoints),
      squaredError: (component.projectedPoints - actualPoints) ** 2,
    })),
  ];
  return records.map((record) => ({
    ...record,
    predictedPoints: round(record.predictedPoints),
    actualPoints: round(record.actualPoints),
    signedError: round(record.signedError),
    absoluteError: round(record.absoluteError),
    squaredError: round(record.squaredError),
  }));
}
