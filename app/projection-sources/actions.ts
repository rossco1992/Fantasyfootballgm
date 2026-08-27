"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  importProjectionCsv,
  refreshConfiguredProjectionSources,
} from "@/services/projection-sources";

const MAX_CSV_BYTES = 2_000_000;

class ProjectionCsvUploadError extends Error {}

function integer(formData: FormData, name: string): number {
  return Number(String(formData.get(name) ?? ""));
}

function optionalWeek(formData: FormData): number | null {
  const value = String(formData.get("week") ?? "").trim();
  return value ? Number(value) : null;
}

function scoring(formData: FormData) {
  return String(formData.get("scoring") ?? "ppr") as
    "standard" | "half_ppr" | "ppr";
}

export async function refreshProjectionSourcesAction(
  formData: FormData,
): Promise<never> {
  await requireAuthenticatedUser();
  let result: Awaited<ReturnType<typeof refreshConfiguredProjectionSources>>;
  try {
    result = await refreshConfiguredProjectionSources({
      season: integer(formData, "season"),
      week: optionalWeek(formData),
      scoring: scoring(formData),
    });
  } catch {
    redirect(
      "/dashboard?error=" +
        encodeURIComponent("Projection sources could not be refreshed."),
    );
  }
  if (result.configured.length === 0) {
    redirect(
      "/dashboard?error=" +
        encodeURIComponent(
          "No paid projection API is configured. Upload a provider CSV instead.",
        ),
    );
  }
  const failed = result.outcomes.filter(
    (entry) => entry.outcome.status === "failed",
  ).length;
  revalidatePath("/dashboard");
  redirect(
    "/dashboard?message=" +
      encodeURIComponent(
        `${result.outcomes.length - failed} projection sources refreshed · ${failed} failed`,
      ),
  );
}

export async function importProjectionCsvAction(
  formData: FormData,
): Promise<never> {
  await requireAuthenticatedUser();
  let outcome: Awaited<ReturnType<typeof importProjectionCsv>>;
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new ProjectionCsvUploadError("Choose a non-empty CSV file.");
    }
    if (file.size > MAX_CSV_BYTES) {
      throw new ProjectionCsvUploadError(
        "Projection CSV files must be 2 MB or smaller.",
      );
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      throw new ProjectionCsvUploadError(
        "Projection imports must use a .csv file.",
      );
    }
    outcome = await importProjectionCsv({
      provider: String(formData.get("provider") ?? ""),
      season: integer(formData, "season"),
      week: optionalWeek(formData),
      scoring: scoring(formData),
      csv: await file.text(),
      fileName: file.name,
      observedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof ProjectionCsvUploadError
        ? error.message
        : "Projection CSV could not be imported. Check the provider, scope, and CSV format.";
    redirect(`/dashboard?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/dashboard");
  redirect(
    "/dashboard?message=" +
      encodeURIComponent(
        `Projection CSV imported: ${outcome.recordsImported} records · ${outcome.unmatchedPlayerCount} unresolved`,
      ),
  );
}
