import { z } from "zod";

import { withProviderRefreshLock } from "@/db/repositories/provider-refresh-lock";
import { providerIngestionRequestSchema } from "@/domain/fantasy-data";
import {
  getProjectionProviderEnv,
  type ProjectionProviderEnv,
} from "@/lib/env";
import {
  FantasyNerdsProviderAdapter,
  HttpFantasyNerdsDataClient,
} from "@/providers/fantasynerds/fantasynerds-provider-adapter";
import {
  FantasyProsProviderAdapter,
  HttpFantasyProsDataClient,
} from "@/providers/fantasypros/fantasypros-provider-adapter";
import {
  MANUAL_PROJECTION_PROVIDERS,
  ManualProjectionCsvAdapter,
} from "@/providers/manual/manual-projection-csv-adapter";
import type { FantasyDataProviderAdapter } from "@/providers/types";
import {
  runOnDemandProviderIngestion,
  type IngestionOptions,
  type ProviderIngestionOutcome,
} from "@/services/provider-ingestion";

export const projectionScoringSchema = z.enum(["standard", "half_ppr", "ppr"]);

export const projectionRefreshInputSchema = z.object({
  season: z.number().int().min(2000).max(2100),
  week: z.number().int().min(1).max(22).nullable(),
  scoring: projectionScoringSchema,
});

export const projectionCsvImportSchema = projectionRefreshInputSchema.extend({
  provider: z.enum(MANUAL_PROJECTION_PROVIDERS),
  csv: z.string().min(1).max(2_000_000),
  fileName: z.string().trim().min(1).max(255),
  observedAt: z.string().datetime({ offset: true }),
});

export type ProjectionSourceName = "FantasyPros" | "Fantasy Nerds";

type ProjectionSourceOptions = IngestionOptions & {
  env?: ProjectionProviderEnv;
  lock?: typeof withProviderRefreshLock;
  run?: typeof runOnDemandProviderIngestion;
};

export function configuredProjectionSources(
  env = getProjectionProviderEnv(),
): ProjectionSourceName[] {
  const configured: ProjectionSourceName[] = [];
  if (env.FANTASYPROS_API_KEY) configured.push("FantasyPros");
  if (env.FANTASYNERDS_API_KEY) configured.push("Fantasy Nerds");
  return configured;
}

export async function refreshConfiguredProjectionSources(
  rawInput: unknown,
  options: ProjectionSourceOptions = {},
): Promise<{
  configured: ProjectionSourceName[];
  outcomes: {
    source: ProjectionSourceName;
    outcome: ProviderIngestionOutcome;
  }[];
}> {
  const input = projectionRefreshInputSchema.parse(rawInput);
  const env = options.env ?? getProjectionProviderEnv();
  const configured = configuredProjectionSources(env);
  const adapters: {
    source: ProjectionSourceName;
    adapter: FantasyDataProviderAdapter;
  }[] = [];
  if (env.FANTASYPROS_API_KEY) {
    adapters.push({
      source: "FantasyPros",
      adapter: new FantasyProsProviderAdapter(
        new HttpFantasyProsDataClient(env.FANTASYPROS_API_KEY),
        input.scoring,
      ),
    });
  }
  if (env.FANTASYNERDS_API_KEY) {
    adapters.push({
      source: "Fantasy Nerds",
      adapter: new FantasyNerdsProviderAdapter(
        new HttpFantasyNerdsDataClient(env.FANTASYNERDS_API_KEY),
        input.scoring,
      ),
    });
  }
  const run = options.run ?? runOnDemandProviderIngestion;
  const lock = options.lock ?? withProviderRefreshLock;
  const request = providerIngestionRequestSchema.parse({
    trigger: "on_demand",
    season: input.season,
    week: input.week,
  });
  const outcomes = [];
  for (const entry of adapters) {
    const outcome = await lock(entry.adapter.descriptor.slug, () =>
      run(entry.adapter, request, {
        store: options.store,
        clock: options.clock,
      }),
    );
    outcomes.push({ source: entry.source, outcome });
  }
  return { configured, outcomes };
}

export async function importProjectionCsv(
  rawInput: unknown,
  options: Pick<ProjectionSourceOptions, "store" | "clock" | "run"> = {},
): Promise<ProviderIngestionOutcome> {
  const input = projectionCsvImportSchema.parse(rawInput);
  const adapter = new ManualProjectionCsvAdapter(
    input.provider,
    input.csv,
    input.fileName,
    input.observedAt,
    input.scoring,
  );
  const run = options.run ?? runOnDemandProviderIngestion;
  return run(
    adapter,
    { season: input.season, week: input.week },
    { store: options.store, clock: options.clock },
  );
}
