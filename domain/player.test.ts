import { describe, expect, it } from "vitest";

import {
  matchPlayerIdentity,
  normalizePlayerName,
  type PlayerIdentityCandidate,
} from "@/domain/player";

const candidates: PlayerIdentityCandidate[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    fullName: "Ja'Marr Chase",
    position: "WR",
    nflTeam: "CIN",
    externalIds: [
      {
        providerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        externalId: "chase-1",
      },
    ],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Josh Allen",
    position: "QB",
    nflTeam: "BUF",
    externalIds: [],
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    fullName: "Josh Allen",
    position: "RB",
    nflTeam: "JAX",
    externalIds: [],
  },
];

describe("canonical player identity matching", () => {
  it("normalizes punctuation, accents, case, and whitespace", () => {
    expect(normalizePlayerName("  Ja’Màrr   Chase  ")).toBe("ja marr chase");
    expect(normalizePlayerName("JA-MARR CHASE")).toBe("ja marr chase");
  });

  it("treats a provider external ID as authoritative across team changes", () => {
    expect(
      matchPlayerIdentity(
        {
          fullName: "Different Display Name",
          position: "WR",
          nflTeam: "DAL",
          externalId: {
            providerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            externalId: "chase-1",
          },
        },
        candidates,
      ),
    ).toEqual({
      kind: "matched",
      playerId: candidates[0]!.id,
      strategy: "provider_external_id",
    });
  });

  it("falls back to normalized name and position without using team as identity", () => {
    expect(
      matchPlayerIdentity(
        { fullName: "Ja Marr Chase", position: "WR", nflTeam: null },
        candidates,
      ),
    ).toEqual({
      kind: "matched",
      playerId: candidates[0]!.id,
      strategy: "normalized_name_position",
    });
  });

  it("uses team only to disambiguate same-name, same-position candidates", () => {
    const duplicate = {
      ...candidates[1]!,
      id: "44444444-4444-4444-8444-444444444444",
      nflTeam: "MIA",
    };

    expect(
      matchPlayerIdentity(
        { fullName: "Josh Allen", position: "QB", nflTeam: "BUF" },
        [...candidates, duplicate],
      ),
    ).toEqual({
      kind: "matched",
      playerId: candidates[1]!.id,
      strategy: "normalized_name_position_team",
    });
  });

  it("returns ambiguous instead of silently merging duplicate candidates", () => {
    const duplicate = {
      ...candidates[1]!,
      id: "55555555-5555-4555-8555-555555555555",
      nflTeam: null,
    };
    const result = matchPlayerIdentity(
      { fullName: "Josh Allen", position: "QB", nflTeam: null },
      [...candidates, duplicate],
    );

    expect(result.kind).toBe("ambiguous");
  });

  it("returns unmatched when there is no safe candidate", () => {
    expect(
      matchPlayerIdentity(
        { fullName: "New Player", position: "RB", nflTeam: null },
        candidates,
      ),
    ).toEqual({ kind: "unmatched" });
  });
});
