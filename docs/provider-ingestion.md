# Provider Ingestion Pipeline

NOC-10 establishes one append-only path for fantasy-data imports. FantasyPros
API responses and uploaded CSV files use the same provider-neutral foundation.

## Lifecycle

1. The authenticated FantasyPros refresh or CSV upload invokes
   `services/provider-ingestion.ts`.
2. The adapter fetches/parses its source and normalizes it.
3. Snapshot metadata and each record are validated independently.
4. Valid player signals, explicit player-ID crosswalks, and game records are
   persisted with their raw source values; invalid records are quarantined with
   a record kind and validation errors.
5. A SHA-256 fingerprint makes replaying the same source delivery idempotent.
6. Provider state records the last attempt, last successful refresh, latest
   valid snapshot, failure count, and stale threshold.

If fetching or normalization fails, the attempt is marked failed and the last
valid snapshot remains available. If only some rows fail—or an adapter reports
an unavailable component in source coverage—valid rows are stored and the run
is marked partial.

Downstream consumers query by canonical player, signal type, season, and week.
The repository returns every matching record from the single freshest
applicable snapshot for each provider, so consumers never need to understand a
provider payload or accidentally blend snapshot ages.

## Snapshot identity and immutability

The fingerprint includes provider slug, adapter version, and the complete
candidate snapshot. The database uniquely constrains `(provider_id,
source_fingerprint)`. Snapshot and record update/delete triggers require any
correction to arrive as a new snapshot, preserving historical evidence for
future forecast-accuracy evaluation.

FantasyPros API and uploaded CSV player rows use the same identity path. Their
freshest snapshots collectively define the draftable player pool.

## Adding a provider

1. Implement `FantasyDataProviderAdapter` from `providers/types.ts`.
2. Keep provider authentication and provider-specific parsing inside the
   adapter.
3. Emit only the normalized contracts from `domain/fantasy-data.ts`.
4. Apply `describeProviderAdapterContract` from
   `tests/contracts/provider-adapter.contract.ts` to representative fixtures.
5. Invoke the same ingestion service from an authenticated server workflow.

The fixture adapter under `providers/fixture/` is the executable example.
Additional API versions or CSV formats should not require changes to the
service, persistence schema, or downstream query contract.
