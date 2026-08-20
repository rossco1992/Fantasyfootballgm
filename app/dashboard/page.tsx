import { logoutAction } from "@/app/auth/actions";
import { requireAuthenticatedUser } from "@/lib/auth/session";

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
        <h2 className="text-lg font-semibold">You’re signed in</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          {user.email ?? "Authenticated user"}
        </p>
        <p className="mt-4 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
          Your session is stored in secure Supabase auth cookies and refreshed
          as you continue using the application.
        </p>
      </section>
    </main>
  );
}
