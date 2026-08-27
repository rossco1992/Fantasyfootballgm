import {
  listOpenPlayerMatchReviews,
  listProviderDataHealth,
  resolvePlayerMatchReview,
} from "@/db/repositories/data-health";

export type DataSourceHealthStatus =
  "not_loaded" | "current" | "stale" | "running" | "partial" | "failed";

export async function retrieveDataHealthSummary(
  clock: () => Date = () => new Date(),
) {
  const [providers, unresolvedMatches] = await Promise.all([
    listProviderDataHealth(),
    listOpenPlayerMatchReviews(),
  ]);
  const now = clock();

  return {
    providers: providers.map((provider) => {
      let status: DataSourceHealthStatus;
      if (!provider.lastStatus || !provider.lastAttemptAt) {
        status = "not_loaded";
      } else if (provider.lastStatus === "failed") {
        status = "failed";
      } else if (provider.lastStatus === "running") {
        status = "running";
      } else if (provider.lastStatus === "partial") {
        status = "partial";
      } else if (
        !provider.lastSuccessAt ||
        !provider.staleAfterSeconds ||
        now.getTime() - provider.lastSuccessAt.getTime() >
          provider.staleAfterSeconds * 1_000
      ) {
        status = "stale";
      } else {
        status = "current";
      }
      return { ...provider, status };
    }),
    unresolvedMatches,
    unresolvedPlayerCount: providers.reduce(
      (total, provider) => total + provider.unresolvedPlayerCount,
      0,
    ),
  };
}

export async function applyManualPlayerMatch(input: {
  userId: string;
  reviewId: string;
  playerId: string;
  clock?: () => Date;
}): Promise<void> {
  await resolvePlayerMatchReview({
    reviewId: input.reviewId,
    playerId: input.playerId,
    actorUserId: input.userId,
    resolvedAt: (input.clock ?? (() => new Date()))(),
  });
}
