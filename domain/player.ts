import { z } from "zod";

export const PLAYER_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DST"] as const;

export const PLAYER_STATUSES = [
  "active",
  "questionable",
  "doubtful",
  "out",
  "injured_reserve",
  "physically_unable_to_perform",
  "suspended",
  "inactive",
  "retired",
  "unknown",
] as const;

export const nflTeamSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{2,3}$/, "Use a valid uppercase NFL team abbreviation.")
  .nullable();

export const canonicalPlayerInputSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  position: z.enum(PLAYER_POSITIONS),
  nflTeam: nflTeamSchema,
  byeWeek: z.number().int().min(1).max(22).nullable(),
  status: z.enum(PLAYER_STATUSES),
});

export const canonicalPlayerSchema = canonicalPlayerInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const draftablePlayerQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  position: z.enum(PLAYER_POSITIONS).nullable().default(null),
  limit: z.number().int().min(1).max(500).default(250),
});

export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];
export type CanonicalPlayerInput = z.infer<typeof canonicalPlayerInputSchema>;
export type CanonicalPlayer = z.infer<typeof canonicalPlayerSchema>;
export type DraftablePlayerQuery = z.input<typeof draftablePlayerQuerySchema>;

export const playerExternalIdentitySchema = z.object({
  providerId: z.string().uuid(),
  externalId: z.string().trim().min(1).max(255),
});

export type PlayerExternalIdentity = z.infer<
  typeof playerExternalIdentitySchema
>;

export type PlayerIdentityCandidate = Pick<
  CanonicalPlayer,
  "id" | "fullName" | "position" | "nflTeam"
> & {
  externalIds: PlayerExternalIdentity[];
};

export type PlayerMatchRequest = Pick<
  CanonicalPlayerInput,
  "fullName" | "position" | "nflTeam"
> & {
  externalId?: PlayerExternalIdentity;
};

export type PlayerMatchResult =
  | {
      kind: "matched";
      playerId: string;
      strategy:
        | "provider_external_id"
        | "normalized_name_position"
        | "normalized_name_position_team";
    }
  | { kind: "ambiguous"; candidateIds: string[] }
  | { kind: "unmatched" };

/**
 * Normalizes display-name variations for deterministic candidate matching.
 * Provider IDs remain authoritative; normalized names are only a fallback.
 */
export function normalizePlayerName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function matchPlayerIdentity(
  request: PlayerMatchRequest,
  candidates: PlayerIdentityCandidate[],
): PlayerMatchResult {
  if (request.externalId) {
    const externalMatches = candidates.filter((candidate) =>
      candidate.externalIds.some(
        (identity) =>
          identity.providerId === request.externalId?.providerId &&
          identity.externalId === request.externalId.externalId,
      ),
    );

    if (externalMatches.length === 1) {
      return {
        kind: "matched",
        playerId: externalMatches[0]!.id,
        strategy: "provider_external_id",
      };
    }
    if (externalMatches.length > 1) {
      return {
        kind: "ambiguous",
        candidateIds: externalMatches.map((candidate) => candidate.id),
      };
    }
  }

  const normalizedName = normalizePlayerName(request.fullName);
  const namePositionMatches = candidates.filter(
    (candidate) =>
      candidate.position === request.position &&
      normalizePlayerName(candidate.fullName) === normalizedName,
  );

  if (namePositionMatches.length === 1) {
    return {
      kind: "matched",
      playerId: namePositionMatches[0]!.id,
      strategy: "normalized_name_position",
    };
  }

  if (namePositionMatches.length > 1 && request.nflTeam) {
    const teamMatches = namePositionMatches.filter(
      (candidate) => candidate.nflTeam === request.nflTeam,
    );
    if (teamMatches.length === 1) {
      return {
        kind: "matched",
        playerId: teamMatches[0]!.id,
        strategy: "normalized_name_position_team",
      };
    }
  }

  if (namePositionMatches.length > 1) {
    return {
      kind: "ambiguous",
      candidateIds: namePositionMatches.map((candidate) => candidate.id),
    };
  }

  return { kind: "unmatched" };
}
