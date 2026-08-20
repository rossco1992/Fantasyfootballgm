import { logoutAction } from "@/app/auth/actions";
import { LeagueConfigurationForm } from "@/components/league/league-configuration-form";
import { DEFAULT_LEAGUE_CONFIGURATION } from "@/domain/league-configuration";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { retrieveLeagueConfiguration } from "@/services/league-configurations";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const [user, params] = await Promise.all([
    requireAuthenticatedUser(),
    searchParams,
  ]);
  const configuration = await retrieveLeagueConfiguration(user.id);
  const initialConfiguration = configuration
    ? {
        name: configuration.name,
        teamCount: configuration.teamCount,
        draftType: configuration.draftType,
        draftPosition: configuration.draftPosition,
        scoringPreset: configuration.scoringPreset,
        rosterSlots: configuration.rosterSlots,
      }
    : DEFAULT_LEAGUE_CONFIGURATION;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
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

      <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-8">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            {user.email ?? "Authenticated user"}
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">
            {configuration ? "Edit league settings" : "Create your league"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
            Rankings and draft recommendations will use these exact league
            rules.
          </p>
        </div>
        <LeagueConfigurationForm
          initialConfiguration={initialConfiguration}
          isEditing={configuration !== null}
        />
      </section>
    </main>
  );
}
