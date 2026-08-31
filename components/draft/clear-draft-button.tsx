"use client";

import { useFormStatus } from "react-dom";

function ClearButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
      disabled={pending}
      type="submit"
    >
      {pending ? "Clearing…" : "Clear draft board"}
    </button>
  );
}

export function ClearDraftButton({
  action,
  leagueId,
}: {
  action: (formData: FormData) => Promise<void>;
  leagueId: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Clear every recorded pick? Your player pool, team names, and queue will be kept.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="leagueId" type="hidden" value={leagueId} />
      <ClearButton />
    </form>
  );
}
