import { beforeEach, describe, expect, it, vi } from "vitest";

import { query, withTransaction } from "@/db/client";
import {
  failProviderIngestionRun,
  listLatestPlayerData,
  persistProviderSnapshot,
  startProviderIngestionRun,
  type PersistProviderSnapshotInput,
} from "@/db/repositories/provider-ingestion";
import { FIXTURE_PROVIDER_DESCRIPTOR } from "@/providers/fixture/fixture-provider-adapter";

vi.mock("@/db/client", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

const providerId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const snapshotId = "33333333-3333-4333-8333-333333333333";
const startedAt = new Date("2026-08-20T12:01:00.000Z");
const importedAt = new Date("2026-08-20T12:01:01.000Z");

const providerRow = {
  id: providerId,
  slug: "fixture-data",
  name: "Fixture Fantasy Data",
  created_at: startedAt,
};

const runRow = {
  id: runId,
  provider_id: providerId,
  trigger_type: "on_demand",
  status: "running",
  adapter_version: "1.0.0",
  season: 2026,
  week: 1,
  started_at: startedAt,
  completed_at: null,
  records_received: 0,
  records_imported: 0,
  records_rejected: 0,
  unmatched_player_count: 0,
  error_details: null,
  created_at: startedAt,
};

const snapshotRow = {
  id: snapshotId,
  provider_id: providerId,
  ingestion_run_id: runId,
  source_fingerprint: "a".repeat(64),
  adapter_version: "1.0.0",
  season: 2026,
  week: 1,
  observed_at: new Date("2026-08-20T12:00:00.000Z"),
  imported_at: importedAt,
  provenance: {
    source: "Fixture Fantasy Data",
    sourceId: "fixture-1",
    sourceUrl: null,
    notes: [],
  },
  created_at: importedAt,
};

const persistInput: PersistProviderSnapshotInput = {
  runId,
  providerId,
  descriptor: FIXTURE_PROVIDER_DESCRIPTOR,
  request: { trigger: "on_demand", season: 2026, week: 1 },
  snapshot: {
    season: 2026,
    week: 1,
    observedAt: "2026-08-20T12:00:00.000Z",
    provenance: snapshotRow.provenance,
  },
  sourceFingerprint: snapshotRow.source_fingerprint,
  records: [
    {
      externalPlayerId: "fixture-cmc",
      recordKey: "fixture-cmc:projection",
      normalized: {
        type: "projection",
        scoring: "ppr",
        projectedPoints: 21.7,
        stats: { receptions: 5 },
      },
      raw: { projected_points: "21.7" },
    },
  ],
  rejections: [],
  importedAt,
};

describe("provider ingestion repository", () => {
  const client = { query: vi.fn() };

  beforeEach(() => {
    vi.mocked(query).mockReset();
    client.query.mockReset();
    vi.mocked(withTransaction).mockReset();
    vi.mocked(withTransaction).mockImplementation(async (work) =>
      work(client as never),
    );
  });

  it("starts a run and updates provider freshness atomically", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [providerRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [runRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await startProviderIngestionRun(
      FIXTURE_PROVIDER_DESCRIPTOR,
      { trigger: "on_demand", season: 2026, week: 1 },
      startedAt,
    );

    expect(result).toEqual({ id: runId, providerId });
    expect(client.query.mock.calls[0]?.[0]).toContain("on conflict (slug)");
    expect(client.query.mock.calls[2]?.[0]).toContain(
      "insert into provider_ingestion_state",
    );
  });

  it("persists raw and normalized records and completes the run", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await persistProviderSnapshot(persistInput);

    expect(result).toMatchObject({
      status: "succeeded",
      duplicate: false,
      recordsImported: 1,
      unmatchedPlayerCount: 0,
    });
    const recordInsert = client.query.mock.calls[1];
    expect(recordInsert?.[0]).toContain("normalized_payload, raw_payload");
    expect(recordInsert?.[1]?.[5]).toContain('"projectedPoints":21.7');
    expect(recordInsert?.[1]?.[6]).toBe('{"projected_points":"21.7"}');
  });

  it("reuses an existing fingerprint without inserting duplicate records", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await persistProviderSnapshot(persistInput);

    expect(result).toMatchObject({ duplicate: true, recordsImported: 0 });
    expect(client.query.mock.calls).toHaveLength(5);
    expect(
      client.query.mock.calls.some((call) =>
        String(call[0]).includes("insert into provider_data_records"),
      ),
    ).toBe(false);
  });

  it("marks a failed run without replacing the last successful snapshot", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await failProviderIngestionRun({
      runId,
      providerId,
      staleAfterSeconds: 86_400,
      completedAt: importedAt,
      errorDetails: { kind: "provider_error" },
      recordsReceived: 0,
      rejections: [],
    });

    expect(result.status).toBe("failed");
    const stateUpsert = String(client.query.mock.calls[1]?.[0]);
    expect(stateUpsert).toContain(
      "consecutive_failures = provider_ingestion_state.consecutive_failures + 1",
    );
    expect(stateUpsert).not.toContain("latest_snapshot_id =");
    expect(stateUpsert).not.toContain("last_success_at =");
  });

  it("queries all matching records from the freshest snapshot per provider", async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          provider_id: providerId,
          provider_slug: "fixture-data",
          snapshot_id: snapshotId,
          adapter_version: "1.0.0",
          season: 2026,
          week: 1,
          observed_at: snapshotRow.observed_at,
          imported_at: importedAt,
          provenance: snapshotRow.provenance,
          player_id: "aaaaaaaa-0000-0000-0000-000000000001",
          external_player_id: "fixture-cmc",
          data_type: "projection",
          record_key: "fixture-cmc:projection",
          normalized_payload: persistInput.records[0]!.normalized,
          raw_payload: persistInput.records[0]!.raw,
        },
      ],
    } as never);

    const records = await listLatestPlayerData({
      playerId: "aaaaaaaa-0000-0000-0000-000000000001",
      dataType: "projection",
      season: 2026,
      week: 1,
    });

    expect(records[0]).toMatchObject({
      providerSlug: "fixture-data",
      snapshotId,
      normalized: { type: "projection", projectedPoints: 21.7 },
    });
    const sql = String(vi.mocked(query).mock.calls[0]?.[0]);
    expect(sql).toContain("with latest_snapshots as");
    expect(sql).toContain("distinct on (s.provider_id)");
    expect(sql).toContain("r.snapshot_id = latest.snapshot_id");
  });
});
