import { z } from "zod";

import { providerIngestionRequestSchema } from "@/domain/fantasy-data";
import {
  MANUAL_PROJECTION_PROVIDERS,
  ManualProjectionCsvAdapter,
} from "@/providers/manual/manual-projection-csv-adapter";
import {
  runOnDemandProviderIngestion,
  type IngestionOptions,
  type ProviderIngestionOutcome,
} from "@/services/provider-ingestion";

export const MAX_CSV_FILES = 20;
export const MAX_CSV_BYTES = 2_000_000;
export const MAX_CSV_TOTAL_BYTES = 4_000_000;

export const csvScoringSchema = z.enum(["standard", "half_ppr", "ppr"]);

const csvScopeSchema = z.object({
  provider: z.enum(MANUAL_PROJECTION_PROVIDERS),
  season: z.number().int().min(2000).max(2100),
  week: z.number().int().min(1).max(22).nullable(),
  scoring: csvScoringSchema,
});

const csvFileSchema = z.object({
  csv: z
    .string()
    .min(1)
    .refine((value) => Buffer.byteLength(value, "utf8") <= MAX_CSV_BYTES, {
      message: "CSV file is too large.",
    }),
  fileName: z.string().trim().min(1).max(255),
  observedAt: z.string().datetime({ offset: true }),
});

export const csvBatchImportSchema = csvScopeSchema
  .extend({
    files: z.array(csvFileSchema).min(1).max(MAX_CSV_FILES),
  })
  .refine(
    (input) =>
      input.files.reduce(
        (total, file) => total + Buffer.byteLength(file.csv, "utf8"),
        0,
      ) <= MAX_CSV_TOTAL_BYTES,
    { path: ["files"], message: "CSV batch is too large." },
  );

export type CsvBatchImportResult = {
  files: Array<
    | {
        fileName: string;
        status: "imported";
        outcome: ProviderIngestionOutcome;
      }
    | { fileName: string; status: "failed" }
  >;
};

type CsvImportOptions = Pick<IngestionOptions, "store" | "clock"> & {
  run?: typeof runOnDemandProviderIngestion;
};

async function importCsvFile(
  input: z.infer<typeof csvScopeSchema> & z.infer<typeof csvFileSchema>,
  options: CsvImportOptions,
): Promise<ProviderIngestionOutcome> {
  const adapter = new ManualProjectionCsvAdapter(
    input.provider,
    input.csv,
    input.fileName,
    input.observedAt,
    input.scoring,
  );
  const request = providerIngestionRequestSchema.parse({
    trigger: "on_demand",
    season: input.season,
    week: input.week,
  });
  const run = options.run ?? runOnDemandProviderIngestion;
  return run(adapter, request, {
    store: options.store,
    clock: options.clock,
    updateCanonicalPlayerMetadata: true,
  });
}

/**
 * Import files sequentially so every valid upload is retained even when a
 * neighboring file fails. Each filename receives a stable provider snapshot
 * stream, allowing rankings and projections exported separately to coexist.
 */
export async function importCsvBatch(
  rawInput: unknown,
  options: CsvImportOptions = {},
): Promise<CsvBatchImportResult> {
  const input = csvBatchImportSchema.parse(rawInput);
  const files: CsvBatchImportResult["files"] = [];
  for (const file of input.files) {
    try {
      const outcome = await importCsvFile(
        {
          provider: input.provider,
          season: input.season,
          week: input.week,
          scoring: input.scoring,
          ...file,
        },
        options,
      );
      if (outcome.status === "failed") {
        files.push({ fileName: file.fileName, status: "failed" });
      } else {
        files.push({ fileName: file.fileName, status: "imported", outcome });
      }
    } catch {
      files.push({ fileName: file.fileName, status: "failed" });
    }
  }
  return { files };
}
