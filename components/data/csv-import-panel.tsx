import { importCsvFilesAction } from "@/app/csv-import/actions";

export function CsvImportPanel({
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
          Upload your CSV files
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
          Add rankings, projections, and player lists before or during your
          draft. You can select several files at once.
        </p>
      </div>

      <form action={importCsvFilesAction} className="mt-6 grid gap-4">
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
          className="w-fit rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          type="submit"
        >
          Upload CSV files
        </button>
      </form>
    </section>
  );
}
