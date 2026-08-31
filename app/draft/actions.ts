"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  clearDraftBoard,
  queueDraftPlayer,
  recordNextDraftPick,
  renameDraftTeams,
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

export async function uploadYahooPlayersAction(
  formData: FormData,
): Promise<never> {
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
  let result: Awaited<ReturnType<typeof importCsvBatch>>;
  try {
    result = await importCsvBatch({
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
  } catch {
    redirect(
      draftUrl(
        "error",
        "The Yahoo CSV could not be imported. Check the file format and try again.",
      ),
    );
  }
  const importedFile = result.files[0];
  if (importedFile?.status !== "imported") {
    redirect(
      draftUrl(
        "error",
        "The Yahoo CSV needs Player, Position (or Pos), and Rank (or ADP) columns.",
      ),
    );
  }
  const playerPoolSnapshotId = importedFile.outcome.snapshotId;
  if (!playerPoolSnapshotId) {
    redirect(
      draftUrl(
        "error",
        "The Yahoo players imported without a usable draft snapshot. Try the upload again.",
      ),
    );
  }
  try {
    await startDraftRoom(user.id, leagueId, season, playerPoolSnapshotId);
  } catch {
    redirect(
      draftUrl(
        "error",
        "The players imported, but the draft room could not start. Refresh and try again.",
      ),
    );
  }
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

export async function renameDraftTeamsAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const leagueId = String(formData.get("leagueId") ?? "");
  const teamNames = Object.fromEntries(
    [...formData.entries()]
      .filter(([key]) => key.startsWith("teamName."))
      .map(([key, value]) => [key.slice("teamName.".length), String(value)]),
  );
  try {
    await renameDraftTeams(user.id, leagueId, teamNames);
  } catch {
    redirect(draftUrl("error", "Team names could not be saved."));
  }
  revalidatePath("/draft");
  redirect(draftUrl("message", "Team names saved."));
}

export async function undoDraftPickAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  await undoLastDraftPick(user.id, String(formData.get("leagueId") ?? ""));
  revalidatePath("/draft");
  redirect(draftUrl("message", "Last pick removed."));
}

export async function clearDraftBoardAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  try {
    await clearDraftBoard(user.id, String(formData.get("leagueId") ?? ""));
  } catch {
    redirect(draftUrl("error", "The draft board could not be cleared."));
  }
  revalidatePath("/draft");
  redirect(draftUrl("message", "Draft board cleared."));
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
