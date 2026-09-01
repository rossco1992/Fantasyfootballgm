import { z } from "zod";

import { canonicalPlayerSchema } from "@/domain/player";
import type { RosterAssignment } from "@/domain/roster";

export const DRAFT_SESSION_STATUSES = ["active", "completed"] as const;

export const draftSessionSchema = z.object({
  id: z.string().uuid(),
  leagueId: z.string().uuid(),
  season: z.number().int().min(2000).max(2100),
  status: z.enum(DRAFT_SESSION_STATUSES),
  teamNames: z.record(z.string(), z.string()),
  keeperTeamSlots: z
    .record(z.string(), z.number().int().positive())
    .default({}),
  playerPoolSnapshotId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const draftPlayerSchema = canonicalPlayerSchema.extend({
  yahooRank: z.number().positive().nullable(),
  yahooAdp: z.number().positive().nullable(),
});

export const draftPickSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  playerId: z.string().uuid(),
  fullName: z.string(),
  position: z.string(),
  nflTeam: z.string().nullable(),
  overallPick: z.number().int().positive(),
  round: z.number().int().positive(),
  pickInRound: z.number().int().positive(),
  fantasyTeamSlot: z.number().int().positive(),
  createdAt: z.date(),
});

export const draftQueueEntrySchema = draftPlayerSchema.extend({
  queueEntryId: z.string().uuid(),
  queueOrder: z.number().int().positive(),
});

export type DraftSession = z.infer<typeof draftSessionSchema>;
export type DraftPlayer = z.infer<typeof draftPlayerSchema>;
export type DraftPick = z.infer<typeof draftPickSchema>;
export type DraftQueueEntry = z.infer<typeof draftQueueEntrySchema>;

export type DraftKeeperReservation = {
  keeper: RosterAssignment;
  fantasyTeamSlot: number;
  overallPick: number;
};

export type DraftPickCoordinates = {
  overallPick: number;
  round: number;
  pickInRound: number;
  fantasyTeamSlot: number;
};

/** Deterministically maps an overall pick to its round and fantasy-team slot. */
export function draftPickCoordinates(
  overallPick: number,
  teamCount: number,
  draftType: "snake" | "linear",
): DraftPickCoordinates {
  if (!Number.isInteger(overallPick) || overallPick < 1) {
    throw new Error("Overall pick must be a positive whole number.");
  }
  if (!Number.isInteger(teamCount) || teamCount < 2) {
    throw new Error("Team count must be at least 2.");
  }

  const round = Math.ceil(overallPick / teamCount);
  const pickInRound = ((overallPick - 1) % teamCount) + 1;
  const fantasyTeamSlot =
    draftType === "snake" && round % 2 === 0
      ? teamCount - pickInRound + 1
      : pickInRound;

  return { overallPick, round, pickInRound, fantasyTeamSlot };
}

/** Deterministically maps a round and fantasy-team slot back to overall pick. */
export function draftOverallPick(
  round: number,
  fantasyTeamSlot: number,
  teamCount: number,
  draftType: "snake" | "linear",
): number {
  if (!Number.isInteger(round) || round < 1) {
    throw new Error("Round must be a positive whole number.");
  }
  if (
    !Number.isInteger(fantasyTeamSlot) ||
    fantasyTeamSlot < 1 ||
    fantasyTeamSlot > teamCount
  ) {
    throw new Error("Fantasy-team slot is outside the league.");
  }
  const pickInRound =
    draftType === "snake" && round % 2 === 0
      ? teamCount - fantasyTeamSlot + 1
      : fantasyTeamSlot;
  return (round - 1) * teamCount + pickInRound;
}

/** Returns the first live draft pick not already drafted or reserved. */
export function nextOpenOverallPick(
  occupiedOverallPicks: Iterable<number>,
  totalPicks: number,
): number | null {
  const occupied = new Set(occupiedOverallPicks);
  for (let overallPick = 1; overallPick <= totalPicks; overallPick += 1) {
    if (!occupied.has(overallPick)) return overallPick;
  }
  return null;
}
