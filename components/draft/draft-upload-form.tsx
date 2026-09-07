"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

function SubmitButton({ initialSetup = false }: { initialSetup?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending}
      aria-busy={pending}
      className="w-full rounded-lg bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:bg-emerald-800 disabled:opacity-70 sm:w-auto"
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <span
          className="flex items-center justify-center gap-2"
          aria-live="polite"
        >
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
          Uploading CSV…
        </span>
      ) : initialSetup ? (
        "Load player CSV"
      ) : (
        "Replace player CSV"
      )}
    </button>
  );
}

export function DraftUploadForm({
  action,
  leagueId,
  scoring,
  season,
  returnTab = "available",
  initialSetup = false,
}: {
  action: (formData: FormData) => Promise<void>;
  leagueId: string;
  scoring: string;
  season: number;
  returnTab?: string;
  initialSetup?: boolean;
}) {
  const [fileName, setFileName] = useState("");

  return (
    <form action={action} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
      <input name="leagueId" type="hidden" value={leagueId} />
      <input name="season" type="hidden" value={season} />
      <input name="scoring" type="hidden" value={scoring} />
      <input name="returnTab" type="hidden" value={returnTab} />
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-3 text-sm hover:border-emerald-500 hover:bg-emerald-50/50 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/20">
        <span className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 font-semibold dark:border-neutral-700">
          Choose CSV
        </span>
        <span className="min-w-0 truncate text-neutral-500 dark:text-neutral-400">
          {fileName || "No file selected"}
        </span>
        <input
          accept=".csv,text/csv"
          className="sr-only"
          name="file"
          onChange={(event) =>
            setFileName(event.currentTarget.files?.[0]?.name ?? "")
          }
          required
          type="file"
        />
      </label>
      <SubmitButton initialSetup={initialSetup} />
      <p className="text-xs leading-5 text-neutral-500 sm:col-span-2 dark:text-neutral-400">
        This replaces the player pool immediately. FantasyPros is refreshed
        separately and never blocks the CSV upload.
      </p>
    </form>
  );
}
