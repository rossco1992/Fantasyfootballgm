import {
  importProjectionCsvAction,
  refreshProjectionSourcesAction,
} from "@/app/projection-sources/actions";

export function ProjectionSourcesPanel({
  configuredSources,
  season,
}: {
  configuredSources: string[];
  season: number;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div>
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          Projection data
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">
          FantasyPros and Fantasy Nerds
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
          Configured APIs: {configuredSources.join(", ") || "none"}. CSV exports
          remain available when a paid developer key is not configured.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <form
          action={refreshProjectionSourcesAction}
          className="grid gap-3 rounded-xl bg-neutral-50 p-4 dark:bg-neutral-900"
        >
          <h3 className="font-semibold">Refresh configured APIs</h3>
          <ProjectionScopeFields season={season} />
          <button
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            type="submit"
          >
            Refresh projections
          </button>
        </form>

        <form
          action={importProjectionCsvAction}
          className="grid gap-3 rounded-xl bg-neutral-50 p-4 dark:bg-neutral-900"
        >
          <h3 className="font-semibold">Import provider CSV</h3>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium">Provider</span>
            <select
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
              name="provider"
            >
              <option value="fantasypros">FantasyPros</option>
              <option value="fantasynerds">Fantasy Nerds</option>
            </select>
          </label>
          <ProjectionScopeFields season={season} />
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium">CSV export</span>
            <input accept=".csv,text/csv" name="file" required type="file" />
          </label>
          <button
            className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950"
            type="submit"
          >
            Import CSV
          </button>
        </form>
      </div>
    </section>
  );
}

function ProjectionScopeFields({ season }: { season: number }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium">Season</span>
        <input
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
          defaultValue={season}
          min={2021}
          name="season"
          required
          type="number"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium">Week</span>
        <input
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
          max={22}
          min={1}
          name="week"
          placeholder="Draft"
          type="number"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium">Scoring</span>
        <select
          className="rounded-lg border border-neutral-300 bg-white px-2 py-2 dark:border-neutral-700 dark:bg-neutral-950"
          defaultValue="ppr"
          name="scoring"
        >
          <option value="standard">Standard</option>
          <option value="half_ppr">Half PPR</option>
          <option value="ppr">PPR</option>
        </select>
      </label>
    </div>
  );
}
