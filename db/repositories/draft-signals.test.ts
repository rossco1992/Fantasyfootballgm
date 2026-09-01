import { beforeEach, describe, expect, it, vi } from "vitest";

import { query } from "@/db/client";
import { getLatestFantasyProsDraftData } from "@/db/repositories/draft-signals";

vi.mock("@/db/client", () => ({ query: vi.fn() }));

const PLAYER_ID = "22222222-2222-4222-8222-222222222222";
const SNAPSHOT_ID = "44444444-4444-4444-8444-444444444444";
const observedAt = new Date("2026-08-31T12:00:00.000Z");
const provenance = {
  source: "FantasyPros API",
  sourceId: "2026:preseason:half_ppr",
  sourceUrl: "https://api.fantasypros.com/public/v2/docs",
  notes: [],
  coverage: [
    {
      dataset: "rankings",
      status: "available",
      recordCount: 200,
      sourceUrl:
        "https://api.fantasypros.com/public/v2/json/nfl/2026/consensus-rankings",
      observedAt: observedAt.toISOString(),
      detail: null,
    },
  ],
};

function row(dataType: string, normalizedPayload: unknown) {
  return {
    snapshot_id: SNAPSHOT_ID,
    observed_at: observedAt,
    provenance,
    player_id: PLAYER_ID,
    data_type: dataType,
    normalized_payload: normalizedPayload,
  };
}

describe("draft signals repository", () => {
  beforeEach(() => vi.mocked(query).mockReset());

  it("loads the latest FantasyPros draft signals and freshest news", async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        row("ranking", {
          type: "ranking",
          rank: 3,
          positionRank: 2,
          tier: 1,
          expertCount: 120,
        }),
        row("adp", {
          type: "adp",
          overall: 4.5,
          position: 2,
          sampleSize: null,
          format: "HALF",
        }),
        row("injury", {
          type: "injury",
          status: "questionable",
          practiceStatus: "Limited",
          details: "Calf",
        }),
        row("news", {
          type: "news",
          headline: "Older update",
          summary: null,
          publishedAt: "2026-08-30T12:00:00.000Z",
          url: null,
        }),
        row("news", {
          type: "news",
          headline: "Returned to practice",
          summary: "Limited on Sunday.",
          publishedAt: "2026-08-31T11:00:00.000Z",
          url: null,
        }),
      ],
      rowCount: 5,
      command: "SELECT",
      oid: 0,
      fields: [],
    });

    await expect(getLatestFantasyProsDraftData(2026)).resolves.toEqual({
      snapshotId: SNAPSHOT_ID,
      observedAt,
      coverage: provenance.coverage,
      signals: [
        {
          playerId: PLAYER_ID,
          rank: 3,
          positionRank: 2,
          tier: 1,
          expertCount: 120,
          adp: 4.5,
          injuryStatus: "questionable",
          injuryDetails: "Calf",
          newsHeadline: "Returned to practice",
          newsSummary: "Limited on Sunday.",
          newsPublishedAt: new Date("2026-08-31T11:00:00.000Z"),
        },
      ],
    });
    expect(vi.mocked(query).mock.calls[0]?.[0]).toContain(
      "record.data_type in ('ranking', 'adp', 'injury', 'news')",
    );
  });

  it("returns null before FantasyPros has been refreshed", async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      command: "SELECT",
      oid: 0,
      fields: [],
    });

    await expect(getLatestFantasyProsDraftData(2026)).resolves.toBeNull();
  });
});
