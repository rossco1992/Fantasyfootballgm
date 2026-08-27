import { startHistoricalBackfillAction } from "@/app/historical-backfill/actions";
import type { retrieveHistoricalBackfillSummary } from "@/services/historical-backfill";

type HistoricalBackfillSummary = Awaited<
  ReturnType<typeof retrieveHistoricalBackfillSummary>
>;

const styles = {
  succeeded:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  missing:
    "bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400",
} as const;

export function HistoricalBackfillPanel({
  summary,
}: {
  summary: HistoricalBackfillSummary;
}) {
  const completed = summary.weeks.filter(
    (scope) => scope.status === "succeeded",
  ).length;
  const seasonRows = Array.from(
    { length: summary.latestSeason - summary.firstSeason + 1 },
    (_, index) => summary.latestSeason - index,
  );

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            Historical data
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">
            nflverse backfill coverage
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-neutral-300">
            {completed} of {summary.weeks.length} supported regular-season weeks
            are fully loaded. Partial and failed weeks remain retryable;
            completed weeks are skipped unless refresh is selected.
          </p>
        </div>

        <form
          action={startHistoricalBackfillAction}
          className="grid grid-cols-2 gap-3 rounded-xl bg-neutral-50 p-4 text-sm sm:grid-cols-4 dark:bg-neutral-900"
        >
          <label className="grid gap-1">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              Season
            </span>
            <input
              className="w-24 rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
              defaultValue={summary.latestSeason}
              max={summary.latestSeason}
              min={summary.firstSeason}
              name="season"
              required
              type="number"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              Start week
            </span>
            <input
              className="w-20 rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
              defaultValue={1}
              max={18}
              min={1}
              name="startWeek"
              required
              type="number"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              End week
            </span>
            <input
              className="w-20 rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
              defaultValue={4}
              max={18}
              min={1}
              name="endWeek"
              required
              type="number"
            />
          </label>
          <button
            className="self-end rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
            type="submit"
          >
            Load weeks
          </button>
          <label className="col-span-2 flex items-center gap-2 text-xs text-neutral-600 sm:col-span-4 dark:text-neutral-300">
            <input name="force" type="checkbox" />
            Refresh completed weeks too
          </label>
        </form>
      </div>

      <div className="mt-6 space-y-3">
        {seasonRows.map((season) => (
          <div
            className="grid gap-2 sm:grid-cols-[4rem_1fr] sm:items-center"
            key={season}
          >
            <h3 className="text-sm font-semibold">{season}</h3>
            <div className="grid grid-cols-9 gap-1.5 sm:grid-cols-[repeat(18,minmax(0,1fr))]">
              {summary.weeks
                .filter((scope) => scope.season === season)
                .map((scope) => (
                  <span
                    className={`rounded px-1 py-1.5 text-center text-xs font-semibold ${styles[scope.status]}`}
                    key={scope.week}
                    title={`Week ${scope.week}: ${scope.status}; ${scope.recordsImported.toLocaleString()} records; ${scope.unmatchedPlayerCount} unresolved${scope.hasUsableSnapshot ? "; usable snapshot retained" : ""}`}
                  >
                    {scope.week}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-3 text-xs text-neutral-600 dark:text-neutral-300">
        {Object.keys(styles).map((status) => (
          <span className="flex items-center gap-1.5 capitalize" key={status}>
            <span
              className={`size-3 rounded ${styles[status as keyof typeof styles]}`}
            />
            {status}
          </span>
        ))}
      </div>
    </section>
  );
}
