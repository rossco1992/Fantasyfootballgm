"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  MAX_CSV_BYTES,
  MAX_CSV_FILES,
  MAX_CSV_TOTAL_BYTES,
  importCsvBatch,
} from "@/services/csv-import";

class CsvUploadError extends Error {}

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

function uploadedFiles(formData: FormData): File[] {
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length === 0) {
    throw new CsvUploadError("Choose at least one CSV file.");
  }
  if (files.length > MAX_CSV_FILES) {
    throw new CsvUploadError(
      `Choose no more than ${MAX_CSV_FILES} CSV files at once.`,
    );
  }
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      throw new CsvUploadError(`${file.name} must use the .csv extension.`);
    }
    if (file.size > MAX_CSV_BYTES) {
      throw new CsvUploadError(`${file.name} must be 2 MB or smaller.`);
    }
  }
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_CSV_TOTAL_BYTES) {
    throw new CsvUploadError("The selected CSV files must total 4 MB or less.");
  }
  return files;
}

export async function importCsvFilesAction(formData: FormData): Promise<never> {
  await requireAuthenticatedUser();
  let result: Awaited<ReturnType<typeof importCsvBatch>>;
  try {
    const files = uploadedFiles(formData);
    const observedAt = new Date().toISOString();
    result = await importCsvBatch({
      provider: String(formData.get("provider") ?? ""),
      season: integer(formData, "season"),
      week: optionalWeek(formData),
      scoring: scoring(formData),
      files: await Promise.all(
        files.map(async (file) => ({
          csv: await file.text(),
          fileName: file.name,
          observedAt,
        })),
      ),
    });
  } catch (error) {
    const message =
      error instanceof CsvUploadError
        ? error.message
        : "The CSV files could not be imported. Check the source, season, scoring, and file format.";
    redirect(`/dashboard?error=${encodeURIComponent(message)}`);
  }

  const imported = result.files.filter((file) => file.status === "imported");
  const failed = result.files.filter((file) => file.status === "failed");
  if (imported.length === 0) {
    redirect(
      `/dashboard?error=${encodeURIComponent(
        `No files were imported. Check: ${failed.map((file) => file.fileName).join(", ")}.`,
      )}`,
    );
  }
  const records = imported.reduce(
    (total, file) => total + file.outcome.recordsImported,
    0,
  );
  revalidatePath("/dashboard");
  const failureSummary =
    failed.length > 0
      ? ` · ${failed.length} failed (${failed.map((file) => file.fileName).join(", ")})`
      : "";
  redirect(
    `/dashboard?message=${encodeURIComponent(
      `${imported.length} CSV file${imported.length === 1 ? "" : "s"} imported · ${records} records${failureSummary}`,
    )}`,
  );
}
