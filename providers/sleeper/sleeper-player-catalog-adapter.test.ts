import { describe, expect, it, vi } from "vitest";

import { providerPlayerIdentityCandidateSchema } from "@/domain/fantasy-data";
import {
  SleeperPlayerCatalogAdapter,
  type SleeperPlayerCatalogClient,
  type SleeperPlayerCatalogPayload,
} from "@/providers/sleeper/sleeper-player-catalog-adapter";
import { describeProviderAdapterContract } from "@/tests/contracts/provider-adapter.contract";
import { ingestProviderData } from "@/services/provider-ingestion";

const request = { trigger: "on_demand" as const, season: 2026, week: null };

const payload: SleeperPlayerCatalogPayload = {
  season: 2026,
  sourceUrl: "https://api.sleeper.app/v1/players/nfl?active=true",
  observedAt: "2026-08-26T00:00:00.000Z",
  players: {
    "4034": {
      player_id: "4034",
      full_name: "Christian McCaffrey",
      position: "RB",
      fantasy_positions: ["RB"],
      team: "SF",
      active: true,
      status: "Active",
      injury_status: "Questionable",
      yahoo_id: 30121,
    },
    SF: {
      player_id: "SF",
      full_name: "San Francisco 49ers",
      position: "DEF",
      fantasy_positions: ["DEF"],
      team: "SF",
      active: true,
    },
    coach: {
      player_id: "coach",
      full_name: "Example Coach",
      position: "HC",
      active: true,
    },
  },
};

class FixtureClient implements SleeperPlayerCatalogClient {
  async fetchPlayers(): Promise<SleeperPlayerCatalogPayload> {
    return structuredClone(payload);
  }
}

function adapter() {
  return new SleeperPlayerCatalogAdapter(new FixtureClient());
}

describeProviderAdapterContract({
  name: "Sleeper player catalog",
  createAdapter: adapter,
  request,
});

describe("Sleeper player catalog adapter", () => {
  it("normalizes only draftable positions and keeps rankings out of the catalog", async () => {
    const instance = adapter();
    const snapshot = instance.normalize(await instance.fetch(request), request);
    const players = (snapshot.players as unknown[]).map((player) =>
      providerPlayerIdentityCandidateSchema.parse(player),
    );

    expect(snapshot.records).toEqual([]);
    expect(players).toHaveLength(2);
    expect(players).toContainEqual(
      expect.objectContaining({
        externalPlayerId: "4034",
        fullName: "Christian McCaffrey",
        position: "RB",
        nflTeam: "SF",
        status: "questionable",
        aliases: expect.arrayContaining([
          expect.objectContaining({
            providerSlug: "yahoo",
            externalId: "30121",
          }),
        ]),
      }),
    );
    expect(players).toContainEqual(
      expect.objectContaining({
        externalPlayerId: "SF",
        position: "DST",
      }),
    );
  });

  it("rejects weekly catalog requests", async () => {
    await expect(adapter().fetch({ ...request, week: 1 })).rejects.toThrow(
      /season-scoped/,
    );
  });

  it("documents attribution, refresh cadence, and licensing boundaries", async () => {
    const instance = adapter();
    const snapshot = instance.normalize(await instance.fetch(request), request);
    const notes = (snapshot.provenance as { notes: string[] }).notes.join(" ");

    expect(notes).toMatch(/Attribution: Sleeper/);
    expect(notes).toMatch(/non-commercial use/);
    expect(notes).toMatch(/no more than once per day/);
    expect(notes).toMatch(/does not supply rankings, ADP, or projections/);
  });

  it("passes malformed draftable players to ingestion for explicit rejection", async () => {
    const malformed = structuredClone(payload);
    malformed.players.broken = {
      player_id: "broken",
      position: "RB",
      active: true,
    };
    const instance = new SleeperPlayerCatalogAdapter({
      async fetchPlayers() {
        return malformed;
      },
    });
    const store = {
      startRun: vi.fn().mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111",
        providerId: "22222222-2222-4222-8222-222222222222",
      }),
      persistSnapshot: vi.fn().mockImplementation(async (input) => ({
        runId: input.runId,
        snapshotId: "33333333-3333-4333-8333-333333333333",
        status: "partial" as const,
        duplicate: false,
        recordsReceived: 0,
        recordsImported: 0,
        recordsRejected: input.rejections.length,
        unmatchedPlayerCount: 0,
        playerIdentitiesReceived:
          input.playerIdentities.length + input.rejections.length,
        playerIdentitiesImported: input.playerIdentities.length,
        gamesReceived: 0,
        gamesImported: 0,
        coverageGaps: [],
      })),
      failRun: vi.fn(),
      getHealth: vi.fn(),
    };

    const outcome = await ingestProviderData(instance, request, { store });

    expect(outcome).toMatchObject({
      status: "partial",
      recordsRejected: 1,
      playerIdentitiesReceived: 3,
    });
    expect(store.persistSnapshot.mock.calls[0]?.[0].rejections).toContainEqual(
      expect.objectContaining({ kind: "player_identity" }),
    );
  });
});
