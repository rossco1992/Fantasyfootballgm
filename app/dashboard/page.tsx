import { logoutAction } from "@/app/auth/actions";
import { FantasyDataPanel } from "@/components/data/fantasy-data-panel";
import { LeagueConfigurationForm } from "@/components/league/league-configuration-form";
import { RosterSetupPanel } from "@/components/roster/roster-setup-panel";
import { DEFAULT_LEAGUE_CONFIGURATION } from "@/domain/league-configuration";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { retrieveLeagueConfiguration } from "@/services/league-configurations";
import { retrieveManualRoster } from "@/services/roster-setup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const [user, params] = await Promise.all([
    requireAuthenticatedUser(),
    searchParams,
  ]);
  const configuration = await retrieveLeagueConfiguration(user.id);
  const assignments = configuration
    ? await retrieveManualRoster(user.id, configuration.id)
    : [];
  const initialConfiguration = configuration
    ? {
        name: configuration.name,
        teamCount: configuration.teamCount,
        leagueFormat: configuration.leagueFormat,
        maxKeepersPerTeam: configuration.maxKeepersPerTeam,
        draftType: configuration.draftType,
        draftPosition: configuration.draftPosition,
        scoringPreset: configuration.scoringPreset,
        rosterSlots: configuration.rosterSlots,
      }
    : DEFAULT_LEAGUE_CONFIGURATION;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-12 sm:py-16">
      <header className="flex flex-col gap-4 border-b border-neutral-200 pb-8 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
        <div>
          <p className="text-sm font-semibold tracking-widest text-emerald-600 uppercase dark:text-emerald-400">
            Fantasy Football GM
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Dashboard</h1>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Sign out
          </button>
        </form>
      </header>

      {params.message ? (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          {params.message}
        </p>
      ) : null}

      {params.error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {params.error}
        </p>
      ) : null}

      <FantasyDataPanel
        defaultScoring={configuration?.scoringPreset ?? "ppr"}
        season={new Date().getUTCFullYear()}
      />

      {configuration ? (
        <>
          <section className="rounded-2xl bg-emerald-950 p-6 text-white shadow-sm sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-300">
                  Step 1 complete
                </p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight">
                  {configuration.name}
                </h2>
                <p className="mt-2 text-sm text-emerald-100">
                  Your league rules are saved. Add roster and keeper context to
                  prepare personalized draft tools.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Teams", configuration.teamCount],
                  ["Scoring", configuration.scoringPreset.replace("_", "-")],
                  ["Draft slot", configuration.draftPosition],
                  [
                    "Keepers",
                    configuration.leagueFormat === "keeper"
                      ? `${configuration.maxKeepersPerTeam} max`
                      : "None",
                  ],
                ].map(([label, value]) => (
                  <div
                    className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur"
                    key={label}
                  >
                    <p className="text-xs text-emerald-200">{label}</p>
                    <p className="mt-1 text-sm font-semibold capitalize">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <RosterSetupPanel
            assignments={assignments}
            keeperLeague={configuration.leagueFormat === "keeper"}
            leagueId={configuration.id}
            maxKeepersPerTeam={configuration.maxKeepersPerTeam}
          />

          <details className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <summary className="cursor-pointer text-lg font-semibold">
              Edit league settings
            </summary>
            <div className="mt-8">
              <LeagueConfigurationForm
                initialConfiguration={initialConfiguration}
                isEditing
              />
            </div>
          </details>
        </>
      ) : (
        <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-8">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Step 1
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">
              Create your league
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
              Rankings and draft recommendations will use these exact league
              rules.
            </p>
          </div>
          <LeagueConfigurationForm
            initialConfiguration={initialConfiguration}
            isEditing={false}
          />
        </section>
      )}
    </main>
  );
}
