"use client";

import { useFormStatus } from "react-dom";

function SubmitButton({ replacement = false }: { replacement?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending}
      className={
        replacement
          ? "rounded-lg border px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
          : "w-fit rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:bg-emerald-800 disabled:opacity-70"
      }
      disabled={pending}
      type="submit"
    >
      {pending
        ? "Loading players…"
        : replacement
          ? "Upload replacement"
          : "Load draft room"}
    </button>
  );
}

export function DraftUploadForm({
  action,
  leagueId,
  scoring,
  season,
  replacement = false,
}: {
  action: (formData: FormData) => Promise<void>;
  leagueId: string;
  scoring: string;
  season: number;
  replacement?: boolean;
}) {
  return (
    <form
      action={action}
      className={
        replacement ? "mt-4 flex flex-col gap-3 sm:flex-row" : "mt-6 grid gap-4"
      }
    >
      <input name="leagueId" type="hidden" value={leagueId} />
      <input name="season" type="hidden" value={season} />
      <input name="scoring" type="hidden" value={scoring} />
      <input
        accept=".csv,text/csv"
        className={
          replacement
            ? undefined
            : "block w-full rounded-lg border border-neutral-300 p-3 text-sm dark:border-neutral-700"
        }
        name="file"
        required
        type="file"
      />
      <SubmitButton replacement={replacement} />
    </form>
  );
}
