import { z } from "zod";

import {
  PLAYER_POSITIONS,
  PLAYER_STATUSES,
  nflTeamSchema,
} from "@/domain/player";

export const ROSTER_ACQUISITION_TYPES = [
  "drafted",
  "waiver",
  "free_agent",
  "unknown",
] as const;

export const manualRosterPlayerInputSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter the player's name.").max(120),
    position: z.enum(PLAYER_POSITIONS),
    nflTeam: nflTeamSchema,
    fantasyTeamName: z
      .string()
      .trim()
      .min(1, "Enter the fantasy team name.")
      .max(80),
    acquisitionType: z.enum(ROSTER_ACQUISITION_TYPES),
    isKeeper: z.boolean(),
    originalDraftRound: z.number().int().min(1).max(40).nullable(),
  })
  .superRefine((input, context) => {
    if (!input.isKeeper) return;
    if (input.acquisitionType !== "drafted") {
      context.addIssue({
        code: "custom",
        path: ["acquisitionType"],
        message:
          "Waiver and free-agent keeper costs are not configured yet. Use a drafted player or save this player without keeper status.",
      });
    }
    if (input.originalDraftRound === null) {
      context.addIssue({
        code: "custom",
        path: ["originalDraftRound"],
        message: "Enter the player's prior-year draft round.",
      });
    }
  });

export const rosterAssignmentSchema = z.object({
  id: z.string().uuid(),
  leagueId: z.string().uuid(),
  playerId: z.string().uuid(),
  fullName: z.string(),
  position: z.enum(PLAYER_POSITIONS),
  nflTeam: nflTeamSchema,
  playerStatus: z.enum(PLAYER_STATUSES),
  fantasyTeamName: z.string(),
  acquisitionType: z.enum(ROSTER_ACQUISITION_TYPES),
  isKeeper: z.boolean(),
  originalDraftSeason: z.number().int().nullable(),
  originalDraftRound: z.number().int().nullable(),
  keeperSeason: z.number().int().nullable(),
  keeperCostRound: z.number().int().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ManualRosterPlayerInput = z.infer<
  typeof manualRosterPlayerInputSchema
>;
export type RosterAssignment = z.infer<typeof rosterAssignmentSchema>;
