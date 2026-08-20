import {
  getLeagueConfigurationByIdForUser,
  getLeagueConfigurationForUser,
  upsertLeagueConfiguration,
} from "@/db/repositories/league-configurations";
import type {
  LeagueConfiguration,
  LeagueConfigurationInput,
} from "@/domain/league-configuration";
import { leagueConfigurationInputSchema } from "@/domain/league-configuration";

/** Stable application boundary for UI, ranking, and draft use cases. */
export async function retrieveLeagueConfiguration(
  userId: string,
): Promise<LeagueConfiguration | null> {
  return getLeagueConfigurationForUser(userId);
}

/** Owner-scoped lookup for downstream services that already have a league ID. */
export async function retrieveLeagueConfigurationById(
  leagueId: string,
  userId: string,
): Promise<LeagueConfiguration | null> {
  return getLeagueConfigurationByIdForUser(leagueId, userId);
}

export async function saveLeagueConfiguration(
  userId: string,
  input: LeagueConfigurationInput,
): Promise<LeagueConfiguration> {
  const configuration = leagueConfigurationInputSchema.parse(input);
  return upsertLeagueConfiguration(userId, configuration);
}
