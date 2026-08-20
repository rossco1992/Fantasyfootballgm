import type {
  ProviderDescriptor,
  ProviderIngestionRequest,
  ProviderSnapshotCandidate,
} from "@/domain/fantasy-data";

/**
 * The only boundary external fantasy-data sources implement (ADR-003).
 * Fetching owns provider I/O; normalize converts the source response into the
 * provider-neutral candidate envelope validated by the ingestion service.
 */
export interface FantasyDataProviderAdapter<TRawPayload = unknown> {
  readonly descriptor: ProviderDescriptor;
  fetch(request: ProviderIngestionRequest): Promise<TRawPayload>;
  normalize(
    payload: TRawPayload,
    request: ProviderIngestionRequest,
  ): ProviderSnapshotCandidate;
}
