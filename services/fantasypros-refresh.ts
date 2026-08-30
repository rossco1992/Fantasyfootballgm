import { z } from "zod";

import { providerIngestionRequestSchema } from "@/domain/fantasy-data";
import { getFantasyProsEnv } from "@/lib/env";
import {
  FantasyProsProviderAdapter,
  HttpFantasyProsDataClient,
  type FantasyProsDataClient,
} from "@/providers/fantasypros/fantasypros-provider-adapter";
import {
  runOnDemandProviderIngestion,
  type IngestionOptions,
} from "@/services/provider-ingestion";

const fantasyProsRefreshSchema = z.object({
  season: z.coerce.number().int().min(2012).max(2100),
  week: z.coerce.number().int().min(1).max(22).nullable().default(null),
  scoring: z.enum(["standard", "half_ppr", "ppr"]),
});

type FantasyProsRefreshOptions = Pick<IngestionOptions, "store" | "clock"> & {
  apiKey?: string;
  client?: FantasyProsDataClient;
  run?: typeof runOnDemandProviderIngestion;
};

/** Pull and persist one current FantasyPros snapshot for the selected scope. */
export async function refreshFantasyProsData(
  rawInput: unknown,
  options: FantasyProsRefreshOptions = {},
) {
  const input = fantasyProsRefreshSchema.parse(rawInput);
  const client =
    options.client ??
    new HttpFantasyProsDataClient(
      options.apiKey ?? getFantasyProsEnv().FANTASYPROS_API_KEY,
    );
  const adapter = new FantasyProsProviderAdapter(
    client,
    input.scoring,
    options.clock,
  );
  const request = providerIngestionRequestSchema.parse({
    trigger: "on_demand",
    season: input.season,
    week: input.week,
  });
  return (options.run ?? runOnDemandProviderIngestion)(adapter, request, {
    store: options.store,
    clock: options.clock,
    updateCanonicalPlayerMetadata: true,
  });
}
