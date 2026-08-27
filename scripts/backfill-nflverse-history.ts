import { closePool } from "@/db/client";
import {
  NFLVERSE_FIRST_SUPPORTED_SEASON,
  NFLVERSE_LAST_REGULAR_SEASON_WEEK,
  latestCompletedNFLSeason,
} from "@/domain/historical-backfill";
import { backfillNflverseHistory } from "@/services/historical-backfill";

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function integerFlag(name: string, fallback: number): number {
  const raw = flag(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value))
    throw new Error(`--${name} must be an integer.`);
  return value;
}

function requestedSeasons(): number[] {
  const latest = latestCompletedNFLSeason();
  const start = integerFlag("start-season", latest);
  const end = integerFlag("end-season", start);
  if (start < NFLVERSE_FIRST_SUPPORTED_SEASON || end > latest || start > end) {
    throw new Error(
      `Season range must be between ${NFLVERSE_FIRST_SUPPORTED_SEASON} and ${latest}.`,
    );
  }
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

async function main(): Promise<void> {
  const startWeek = integerFlag("start-week", 1);
  const endWeek = integerFlag("end-week", NFLVERSE_LAST_REGULAR_SEASON_WEEK);
  let failed = 0;

  for (const season of requestedSeasons()) {
    const result = await backfillNflverseHistory(
      {
        season,
        startWeek,
        endWeek,
        force: process.argv.includes("--force"),
      },
      "scheduled",
    );
    failed += result.failed;
    console.log(
      JSON.stringify(
        {
          season,
          status: result.status,
          skipped: result.skipped,
          succeeded: result.succeeded,
          partial: result.partial,
          failed: result.failed,
          scopes: result.scopes.map((scope) => ({
            season: scope.season,
            week: scope.week,
            kind: scope.kind,
            status:
              scope.kind === "attempted" ? scope.outcome.status : "skipped",
            recordsImported:
              scope.kind === "attempted"
                ? scope.outcome.recordsImported
                : undefined,
            unmatchedPlayerCount:
              scope.kind === "attempted"
                ? scope.outcome.unmatchedPlayerCount
                : undefined,
          })),
        },
        null,
        2,
      ),
    );
  }
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
