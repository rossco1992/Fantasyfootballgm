"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  queueDraftPlayer,
  recordNextDraftPick,
  startDraftRoom,
  undoLastDraftPick,
  unqueueDraftPlayer,
} from "@/services/draft";
import { MAX_CSV_BYTES, importCsvBatch } from "@/services/csv-import";

function draftUrl(
  kind: "message" | "error",
  message: string,
  tab = "available",
): string {
  return `/draft?tab=${encodeURIComponent(tab)}&${kind}=${encodeURIComponent(message)}`;
}

export async function uploadYahooPlayersAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(draftUrl("error", "Choose a Yahoo player CSV to continue."));
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    redirect(draftUrl("error", "Yahoo player data must be a CSV file."));
  }
  if (file.size > MAX_CSV_BYTES) {
    redirect(draftUrl("error", "Yahoo player CSV must be 2 MB or smaller."));
  }

  const leagueId = String(formData.get("leagueId") ?? "");
  const season = Number(formData.get("season"));
  const result = await importCsvBatch({
    provider: "yahoo",
    season,
    week: null,
    scoring: String(formData.get("scoring") ?? "ppr"),
    files: [
      {
        csv: await file.text(),
        fileName: file.name,
        observedAt: new Date().toISOString(),
      },
    ],
  });
  if (result.files[0]?.status !== "imported") {
    redirect(
      draftUrl(
        "error",
        "The Yahoo CSV did not contain recognizable player, position, and rank columns.",
      ),
    );
  }
  await startDraftRoom(user.id, leagueId, season);
  revalidatePath("/draft");
  redirect(
    draftUrl("message", "Yahoo players loaded. Your draft room is ready."),
  );
}

export async function recordDraftPickAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const leagueId = String(formData.get("leagueId") ?? "");
  const tab = String(formData.get("returnTab") ?? "available");
  try {
    await recordNextDraftPick({
      userId: user.id,
      leagueId,
      playerId: String(formData.get("playerId") ?? ""),
    });
  } catch {
    redirect(draftUrl("error", "That pick could not be recorded.", tab));
  }
  revalidatePath("/draft");
  redirect(draftUrl("message", "Pick recorded.", tab));
}

export async function undoDraftPickAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await undoLastDraftPick(user.id, String(formData.get("leagueId") ?? ""));
  revalidatePath("/draft");
  redirect(draftUrl("message", "Last pick removed."));
}

export async function queueDraftPlayerAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await queueDraftPlayer({
    userId: user.id,
    leagueId: String(formData.get("leagueId") ?? ""),
    playerId: String(formData.get("playerId") ?? ""),
  });
  revalidatePath("/draft");
  redirect(draftUrl("message", "Player added to your queue.", "available"));
}

export async function unqueueDraftPlayerAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await unqueueDraftPlayer({
    userId: user.id,
    leagueId: String(formData.get("leagueId") ?? ""),
    playerId: String(formData.get("playerId") ?? ""),
  });
  revalidatePath("/draft");
  redirect(draftUrl("message", "Player removed from your queue.", "queue"));
}
