import { z } from "zod";

export const NFLVERSE_FIRST_SUPPORTED_SEASON = 2021;
export const NFLVERSE_LAST_REGULAR_SEASON_WEEK = 18;
export const MAX_WEB_BACKFILL_WEEKS = 4;

export const historicalBackfillRangeSchema = z
  .object({
    season: z.number().int().min(NFLVERSE_FIRST_SUPPORTED_SEASON).max(2100),
    startWeek: z.number().int().min(1).max(NFLVERSE_LAST_REGULAR_SEASON_WEEK),
    endWeek: z.number().int().min(1).max(NFLVERSE_LAST_REGULAR_SEASON_WEEK),
    force: z.boolean().default(false),
  })
  .refine((range) => range.startWeek <= range.endWeek, {
    message: "The ending week must be on or after the starting week.",
    path: ["endWeek"],
  });

export type HistoricalBackfillRange = z.infer<
  typeof historicalBackfillRangeSchema
>;

export class HistoricalBackfillValidationError extends Error {}

export function latestCompletedNFLSeason(now = new Date()): number {
  // The prior calendar year's NFL regular season runs into January. Delay
  // eligibility until February so Week 18 cannot be sealed from pregame files.
  return now.getUTCMonth() === 0
    ? now.getUTCFullYear() - 2
    : now.getUTCFullYear() - 1;
}

export function validateHistoricalBackfillRange(
  input: HistoricalBackfillRange,
  options: { latestSeason?: number; maxWeeks?: number } = {},
): HistoricalBackfillRange {
  const parsed = historicalBackfillRangeSchema.safeParse(input);
  if (!parsed.success) {
    throw new HistoricalBackfillValidationError(
      parsed.error.issues[0]?.message ?? "The historical range is invalid.",
    );
  }
  const range = parsed.data;
  const latestSeason =
    options.latestSeason ?? latestCompletedNFLSeason(new Date());
  if (range.season > latestSeason) {
    throw new HistoricalBackfillValidationError(
      `Historical backfills currently support completed seasons through ${latestSeason}.`,
    );
  }
  const weekCount = range.endWeek - range.startWeek + 1;
  if (options.maxWeeks !== undefined && weekCount > options.maxWeeks) {
    throw new HistoricalBackfillValidationError(
      `Web backfills are limited to ${options.maxWeeks} weeks at a time.`,
    );
  }
  return range;
}

export function weeksInRange(range: HistoricalBackfillRange): number[] {
  return Array.from(
    { length: range.endWeek - range.startWeek + 1 },
    (_, index) => range.startWeek + index,
  );
}
