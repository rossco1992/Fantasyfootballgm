import { z } from "zod";

export const DRAFT_TYPES = ["snake", "linear"] as const;
export const SCORING_PRESETS = ["standard", "half_ppr", "ppr"] as const;
export const ROSTER_SLOT_KEYS = [
  "qb",
  "rb",
  "wr",
  "te",
  "flex",
  "superflex",
  "k",
  "dst",
  "bench",
] as const;

const startingSlot = z.number().int().min(0).max(10);

export const rosterSlotsSchema = z
  .object({
    qb: startingSlot,
    rb: startingSlot,
    wr: startingSlot,
    te: startingSlot,
    flex: startingSlot,
    superflex: startingSlot,
    k: startingSlot,
    dst: startingSlot,
    bench: z.number().int().min(0).max(20),
  })
  .superRefine((slots, context) => {
    const starters =
      slots.qb +
      slots.rb +
      slots.wr +
      slots.te +
      slots.flex +
      slots.superflex +
      slots.k +
      slots.dst;
    if (starters === 0) {
      context.addIssue({
        code: "custom",
        message: "Configure at least one starting roster slot.",
      });
    }
    if (starters + slots.bench > 40) {
      context.addIssue({
        code: "custom",
        message: "A roster cannot contain more than 40 total slots.",
      });
    }
  });

export const leagueConfigurationInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "League name is required.")
      .max(80, "League name must be 80 characters or fewer."),
    teamCount: z
      .number()
      .int("Team count must be a whole number.")
      .min(4, "A league must have at least 4 teams.")
      .max(20, "A league cannot have more than 20 teams."),
    draftType: z.enum(DRAFT_TYPES, { message: "Select a valid draft type." }),
    draftPosition: z
      .number()
      .int("Draft position must be a whole number.")
      .min(1, "Draft position must be at least 1."),
    scoringPreset: z.enum(SCORING_PRESETS, {
      message: "Select a valid scoring preset.",
    }),
    rosterSlots: rosterSlotsSchema,
  })
  .refine(
    (configuration) => configuration.draftPosition <= configuration.teamCount,
    {
      message: "Draft position cannot exceed the number of teams.",
      path: ["draftPosition"],
    },
  );

export type LeagueConfigurationInput = z.infer<
  typeof leagueConfigurationInputSchema
>;

export type LeagueConfiguration = LeagueConfigurationInput & {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

export const DEFAULT_LEAGUE_CONFIGURATION: LeagueConfigurationInput = {
  name: "My League",
  teamCount: 12,
  draftType: "snake",
  draftPosition: 1,
  scoringPreset: "ppr",
  rosterSlots: {
    qb: 1,
    rb: 2,
    wr: 2,
    te: 1,
    flex: 1,
    superflex: 0,
    k: 1,
    dst: 1,
    bench: 6,
  },
};
