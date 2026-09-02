"use client";

import Link from "next/link";

export default function DraftError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-900 dark:bg-neutral-950">
        <p className="text-sm font-semibold text-red-600 dark:text-red-400">
          Draft room unavailable
        </p>
        <h1 className="mt-2 text-2xl font-bold">
          We couldn&apos;t open this league&apos;s draft room.
        </h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
          Try again once. If it still fails, the app owner may need to finish
          the latest database update.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="min-h-11 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            onClick={reset}
            type="button"
          >
            Try again
          </button>
          <Link
            className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold dark:border-neutral-700"
            href="/dashboard"
          >
            Back to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
