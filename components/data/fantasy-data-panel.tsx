import { importCsvFilesAction } from "@/app/csv-import/actions";
import { refreshFantasyProsAction } from "@/app/fantasypros/actions";

export function FantasyDataPanel({
  season,
  defaultScoring,
}: {
  season: number;
  defaultScoring: "standard" | "half_ppr" | "ppr";
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div>
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          Player data
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">
          Keep your draft data current
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
          Pull the latest players, rankings, ADP, projections, and injuries from
          FantasyPros.
        </p>
      </div>

      <form action={refreshFantasyProsAction} className="mt-6">
        <input name="season" type="hidden" value={season} />
        <input name="scoring" type="hidden" value={defaultScoring} />
        <button
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          type="submit"
        >
          Refresh FantasyPros data
        </button>
      </form>

      <details className="mt-6 border-t border-neutral-200 pt-5 dark:border-neutral-800">
        <summary className="cursor-pointer text-sm font-semibold">
          Upload CSV backup
        </summary>
        <form action={importCsvFilesAction} className="mt-5 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium">CSV source</span>
              <select
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
                name="provider"
              >
                <option value="fantasypros">FantasyPros</option>
                <option value="fantasynerds">Fantasy Nerds</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium">Season</span>
              <input
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
                defaultValue={season}
                min={2000}
                max={2100}
                name="season"
                required
                type="number"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium">Week (optional)</span>
              <input
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
                max={22}
                min={1}
                name="week"
                placeholder="Pre-draft"
                type="number"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium">Scoring</span>
              <select
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
                defaultValue={defaultScoring}
                name="scoring"
              >
                <option value="standard">Standard</option>
                <option value="half_ppr">Half PPR</option>
                <option value="ppr">PPR</option>
              </select>
            </label>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium">CSV files</span>
            <input
              accept=".csv,text/csv"
              multiple
              name="files"
              required
              type="file"
            />
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              Up to 20 files per upload, 2 MB each and 4 MB total.
            </span>
          </label>

          <button
            className="w-fit rounded-lg border border-emerald-600 px-5 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950"
            type="submit"
          >
            Upload CSV files
          </button>
        </form>
      </details>
    </section>
  );
}
