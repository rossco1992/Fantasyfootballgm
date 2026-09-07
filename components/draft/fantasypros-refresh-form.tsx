"use client";

import { useFormStatus } from "react-dom";

function RefreshButton() {
  const { pending } = useFormStatus();
  return (
    <button
      aria-busy={pending}
      className="rounded-lg border border-emerald-600 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60 dark:text-emerald-300 dark:hover:bg-emerald-950"
      disabled={pending}
      type="submit"
    >
      {pending ? "Refreshing FantasyPros…" : "Refresh FantasyPros"}
    </button>
  );
}

export function FantasyProsRefreshForm({
  action,
  leagueId,
  season,
  returnTab,
}: {
  action: (formData: FormData) => Promise<void>;
  leagueId: string;
  season: number;
  returnTab: string;
}) {
  return (
    <form action={action}>
      <input name="leagueId" type="hidden" value={leagueId} />
      <input name="season" type="hidden" value={season} />
      <input name="returnTab" type="hidden" value={returnTab} />
      <RefreshButton />
    </form>
  );
}
