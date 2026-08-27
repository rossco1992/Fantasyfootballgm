import { resolvePlayerMatchAction } from "@/app/data-health/actions";
import type { retrieveDataHealthSummary } from "@/services/data-health";

type DataHealthSummary = Awaited<ReturnType<typeof retrieveDataHealthSummary>>;

const statusStyles = {
  current:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  stale: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  not_loaded:
    "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
} as const;

function label(status: keyof typeof statusStyles): string {
  return status.replace("_", " ");
}

export function DataHealthPanel({ summary }: { summary: DataHealthSummary }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            Data foundation
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">
            Source health and player matching
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-neutral-300">
            Every imported source stays separate and traceable. Questionable
            player identities wait here instead of entering recommendations.
          </p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
          {summary.unresolvedPlayerCount} unresolved
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summary.providers.map((provider) => (
          <article
            className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
            key={provider.providerId}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">
                  {provider.providerName}
                </h3>
                <p className="mt-1 text-xs text-neutral-500">
                  {provider.lastSuccessAt
                    ? `Updated ${provider.lastSuccessAt.toLocaleString()}`
                    : "No successful import"}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusStyles[provider.status]}`}
              >
                {label(provider.status)}
              </span>
            </div>
            <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-300">
              {provider.unresolvedPlayerCount} unresolved player ID
              {provider.unresolvedPlayerCount === 1 ? "" : "s"}
              {provider.consecutiveFailures
                ? ` · ${provider.consecutiveFailures} consecutive failure${provider.consecutiveFailures === 1 ? "" : "s"}`
                : ""}
            </p>
          </article>
        ))}
      </div>

      {summary.unresolvedMatches.length ? (
        <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <h3 className="font-semibold">Player matches needing review</h3>
          <div className="mt-4 space-y-3">
            {summary.unresolvedMatches.map((review) => (
              <article
                className="rounded-xl bg-neutral-50 p-4 dark:bg-neutral-900"
                key={review.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      {review.providerName} · {review.externalPlayerId}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500 capitalize">
                      {review.reason.replaceAll("_", " ")} · seen{" "}
                      {review.occurrences} time
                      {review.occurrences === 1 ? "" : "s"}
                    </p>
                  </div>
                  {review.candidates.length ? (
                    <div className="flex flex-wrap gap-2">
                      {review.candidates.map((candidate) => (
                        <form
                          action={resolvePlayerMatchAction}
                          key={candidate.id}
                        >
                          <input
                            name="reviewId"
                            type="hidden"
                            value={review.id}
                          />
                          <input
                            name="playerId"
                            type="hidden"
                            value={candidate.id}
                          />
                          <button
                            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:bg-neutral-800"
                            type="submit"
                          >
                            Match {candidate.fullName} ({candidate.position}
                            {candidate.nflTeam ? ` · ${candidate.nflTeam}` : ""}
                            )
                          </button>
                        </form>
                      ))}
                    </div>
                  ) : (
                    <form
                      action={resolvePlayerMatchAction}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input name="reviewId" type="hidden" value={review.id} />
                      <label className="grid gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-300">
                        Select the canonical player
                        <select
                          className="max-w-xs rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                          defaultValue=""
                          name="playerId"
                          required
                        >
                          <option disabled value="">
                            Search by typing a player name…
                          </option>
                          {summary.playerOptions.map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.fullName} ({player.position}
                              {player.nflTeam ? ` · ${player.nflTeam}` : ""})
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:bg-neutral-800"
                        type="submit"
                      >
                        Save match
                      </button>
                    </form>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          No player identities need review.
        </p>
      )}
    </section>
  );
}
