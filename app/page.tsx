export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <span className="text-sm font-semibold tracking-widest text-emerald-600 uppercase dark:text-emerald-400">
          Fantasy Football GM
        </span>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Application foundation is running.
        </h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-300">
          A deterministic, data-grounded assistant for draft, waiver, and lineup
          decisions. This is the initialized project shell &mdash; domain
          features are delivered in subsequent stories.
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        <p className="font-medium text-neutral-800 dark:text-neutral-200">
          Getting started
        </p>
        <p className="mt-1">
          See <code className="font-mono">README.md</code> for local setup,{" "}
          <code className="font-mono">.env.example</code> for the
          environment-variable strategy, and{" "}
          <code className="font-mono">docs/adr/</code> for the architectural
          decisions this project follows.
        </p>
      </div>
    </main>
  );
}
