export default function DraftLoading() {
  return (
    <main className="mx-auto min-h-screen max-w-[96rem] px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-sm font-semibold tracking-widest text-emerald-600 uppercase dark:text-emerald-400">
        Fantasy Football GM
      </p>
      <section
        aria-busy="true"
        aria-live="polite"
        className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
      >
        <div className="h-2 w-24 animate-pulse rounded-full bg-emerald-500" />
        <h1 className="mt-5 text-2xl font-bold">Opening draft room…</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Loading your league, keepers, and player data.
        </p>
      </section>
    </main>
  );
}
