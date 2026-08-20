import Link from "next/link";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-12 dark:bg-neutral-950">
      <section className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <Link
          href="/"
          className="text-sm font-semibold tracking-widest text-emerald-600 uppercase dark:text-emerald-400"
        >
          Fantasy Football GM
        </Link>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
          {description}
        </p>
        <div className="mt-7">{children}</div>
        {footer ? (
          <div className="mt-6 border-t border-neutral-200 pt-5 text-center text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
            {footer}
          </div>
        ) : null}
      </section>
    </main>
  );
}
