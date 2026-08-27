"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  HistoricalBackfillValidationError,
  MAX_WEB_BACKFILL_WEEKS,
} from "@/domain/historical-backfill";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { backfillNflverseHistory } from "@/services/historical-backfill";

function integer(formData: FormData, name: string): number {
  return Number(String(formData.get(name) ?? ""));
}

export async function startHistoricalBackfillAction(
  formData: FormData,
): Promise<never> {
  await requireAuthenticatedUser();
  let result: Awaited<ReturnType<typeof backfillNflverseHistory>>;
  try {
    result = await backfillNflverseHistory(
      {
        season: integer(formData, "season"),
        startWeek: integer(formData, "startWeek"),
        endWeek: integer(formData, "endWeek"),
        force: formData.get("force") === "on",
      },
      "on_demand",
      { maxWeeks: MAX_WEB_BACKFILL_WEEKS },
    );
  } catch (error) {
    const message =
      error instanceof HistoricalBackfillValidationError
        ? error.message
        : "The historical backfill could not be started.";
    redirect(`/dashboard?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/dashboard");
  const message = [
    `${result.succeeded} loaded`,
    `${result.skipped} already complete`,
    `${result.partial} partial`,
    `${result.failed} failed`,
  ].join(" · ");
  redirect(`/dashboard?message=${encodeURIComponent(message)}`);
}
