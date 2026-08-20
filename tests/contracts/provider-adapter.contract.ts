import { describe, expect, it } from "vitest";

import {
  providerDescriptorSchema,
  providerRecordCandidateSchema,
  providerSnapshotMetadataSchema,
  type ProviderIngestionRequest,
} from "@/domain/fantasy-data";
import type { FantasyDataProviderAdapter } from "@/providers/types";

/**
 * Reusable contract suite for every real provider adapter. A provider-specific
 * test only supplies a factory and a representative request/fixture.
 */
export function describeProviderAdapterContract<TRawPayload>(options: {
  name: string;
  createAdapter: () => FantasyDataProviderAdapter<TRawPayload>;
  request: ProviderIngestionRequest;
}): void {
  describe(`${options.name} provider adapter contract`, () => {
    it("publishes valid provider metadata", () => {
      expect(() =>
        providerDescriptorSchema.parse(options.createAdapter().descriptor),
      ).not.toThrow();
    });

    it("normalizes a representative payload into the shared contract", async () => {
      const adapter = options.createAdapter();
      const payload = await adapter.fetch(options.request);
      const snapshot = adapter.normalize(payload, options.request);
      const metadata = providerSnapshotMetadataSchema.parse(snapshot);

      expect(metadata).toMatchObject({
        season: options.request.season,
        week: options.request.week,
      });
      expect(Array.isArray(snapshot.records)).toBe(true);
      const records = snapshot.records as unknown[];
      expect(records.length).toBeGreaterThan(0);
      expect(() =>
        records.map((record) => providerRecordCandidateSchema.parse(record)),
      ).not.toThrow();

      const identities = records.map((record) => {
        const parsed = providerRecordCandidateSchema.parse(record);
        return `${parsed.externalPlayerId}:${parsed.normalized.type}:${parsed.recordKey}`;
      });
      expect(new Set(identities).size).toBe(identities.length);
    });
  });
}
