import type { JsonValue } from "@/domain/fantasy-data";
import type { PlayerPosition, PlayerStatus } from "@/domain/player";

export type JsonRecord = Record<string, JsonValue>;

export type AvailableJsonDataset = {
  status: "available";
  sourceUrl: string;
  observedAt: string;
  payload: JsonValue;
};

export type UnavailableJsonDataset = {
  status: "unavailable";
  sourceUrl: string;
  observedAt: null;
  error: string;
};

export type JsonDataset = AvailableJsonDataset | UnavailableJsonDataset;

export function isRecord(value: JsonValue): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function datasetRows(
  dataset: JsonDataset,
  containers: string[],
): JsonRecord[] {
  if (dataset.status === "unavailable") return [];
  const payload = dataset.payload;
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const container of containers) {
    const value = payload[container];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [];
}

export function stringField(row: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

export function numberField(row: JsonRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function positiveIntegerField(
  row: JsonRecord,
  ...keys: string[]
): number | null {
  const value = numberField(row, ...keys);
  return value !== null && Number.isInteger(value) && value > 0 ? value : null;
}

export function playerPosition(value: string | null): PlayerPosition | null {
  const position = value?.toUpperCase().replace(/[^A-Z]/g, "") ?? "";
  if (position === "DEF" || position === "D") return "DST";
  if (position === "FB") return "RB";
  return position === "QB" ||
    position === "RB" ||
    position === "WR" ||
    position === "TE" ||
    position === "K" ||
    position === "DST"
    ? position
    : null;
}

export function playerStatus(value: string | null): PlayerStatus {
  const status = value?.toLowerCase().replace(/[ -]+/g, "_") ?? "";
  if (status === "active" || status === "healthy") return "active";
  if (status === "q" || status === "questionable") return "questionable";
  if (status === "d" || status === "doubtful") return "doubtful";
  if (status === "o" || status === "out") return "out";
  if (status === "ir" || status === "injured_reserve") {
    return "injured_reserve";
  }
  if (status === "pup" || status === "physically_unable_to_perform") {
    return "physically_unable_to_perform";
  }
  if (status === "suspended" || status === "suspension") return "suspended";
  if (status === "inactive") return "inactive";
  if (status === "retired") return "retired";
  return "unknown";
}

export function numericStats(
  row: JsonRecord,
  excludedKeys: Set<string>,
): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const [key, raw] of Object.entries(row)) {
    if (excludedKeys.has(key)) continue;
    const value =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim()
          ? Number(raw)
          : Number.NaN;
    if (Number.isFinite(value)) stats[key] = value;
  }
  return stats;
}

export function observedAt(datasets: JsonDataset[], fallback: string): string {
  return (
    datasets
      .filter(
        (dataset): dataset is AvailableJsonDataset =>
          dataset.status === "available",
      )
      .map((dataset) => dataset.observedAt)
      .sort()
      .at(-1) ?? fallback
  );
}

export async function fetchJsonDataset(
  fetcher: typeof fetch,
  sourceUrl: string,
  init: RequestInit,
  clock: () => Date,
): Promise<JsonDataset> {
  try {
    const response = await fetcher(sourceUrl, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as unknown;
    const serialized = JSON.stringify(payload);
    const parsed = JSON.parse(serialized) as JsonValue;
    const headerDate = response.headers.get("last-modified");
    return {
      status: "available",
      sourceUrl,
      observedAt: headerDate
        ? new Date(headerDate).toISOString()
        : clock().toISOString(),
      payload: parsed,
    };
  } catch (error) {
    return {
      status: "unavailable",
      sourceUrl,
      observedAt: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
