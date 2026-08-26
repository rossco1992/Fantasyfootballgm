import { closePool } from "@/db/client";
import { refreshSleeperPlayerCatalog } from "@/services/player-catalog";

function requestedSeason(): number {
  const value = process.argv[2] ?? String(new Date().getUTCFullYear());
  const season = Number(value);
  if (!Number.isInteger(season) || season < 2000 || season > 2100) {
    throw new Error("Season must be a four-digit year between 2000 and 2100.");
  }
  return season;
}

async function main(): Promise<void> {
  const result = await refreshSleeperPlayerCatalog(requestedSeason(), {
    force: process.argv.includes("--force"),
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
