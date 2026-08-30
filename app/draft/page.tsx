import Link from "next/link";
import { redirect } from "next/navigation";

import { DraftRoomView } from "@/components/draft/draft-room";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { loadDraftRoom } from "@/services/draft";
import { retrieveLeagueConfiguration } from "@/services/league-configurations";

export const dynamic = "force-dynamic";

export default async function DraftPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    message?: string;
    error?: string;
  }>;
}) {
  const [user, params] = await Promise.all([
    requireAuthenticatedUser(),
    searchParams,
  ]);
  const league = await retrieveLeagueConfiguration(user.id);
  if (!league) redirect("/dashboard?error=Create%20a%20league%20first.");
  const room = await loadDraftRoom(user.id, league.id);
  const activeTab =
    params.tab === "queue" || params.tab === "roster"
      ? params.tab
      : "available";

  return (
    <main className="mx-auto min-h-screen max-w-[96rem] px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-widest text-emerald-600 uppercase dark:text-emerald-400">
            Fantasy Football GM
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Draft room</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            {league.name} · {league.teamCount} teams · Pick{" "}
            {league.draftPosition}
          </p>
        </div>
        <Link
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          href="/dashboard"
        >
          Back to dashboard
        </Link>
      </header>
      <DraftRoomView
        activeTab={activeTab}
        error={params.error}
        message={params.message}
        room={room}
      />
    </main>
  );
}
