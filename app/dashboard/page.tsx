import Link from "next/link";

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
        <div className="flex flex-wrap gap-2">
          {configuration ? (
            <Link
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              href="/draft"
            >
              Open draft room
            </Link>
          ) : null}
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Sign out
            </button>
          </form>
        </div>
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
          <RosterSetupPanel
            assignments={assignments}
            keeperLeague={configuration.leagueFormat === "keeper"}
            leagueId={configuration.id}
            maxKeepersPerTeam={configuration.maxKeepersPerTeam}
          />

          <details className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-600 dark:text-neutral-300">
              League settings
            </summary>
            <div className="mt-6 border-b border-neutral-200 pb-6 dark:border-neutral-800">
              <h2 className="text-xl font-bold tracking-tight">
                {configuration.name}
              </h2>
              <p className="mt-2 text-sm text-neutral-600 capitalize dark:text-neutral-300">
                {configuration.teamCount} teams ·{" "}
                {configuration.scoringPreset.replace("_", "-")} · Draft slot{" "}
                {configuration.draftPosition} ·{" "}
                {configuration.leagueFormat === "keeper"
                  ? `${configuration.maxKeepersPerTeam} keeper${
                      configuration.maxKeepersPerTeam === 1 ? "" : "s"
                    } max`
                  : "No keepers"}
              </p>
            </div>
            <div className="mt-6">
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
