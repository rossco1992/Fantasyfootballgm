# Provider Ingestion Pipeline

NOC-10 establishes one append-only path for every fantasy-data provider. It is
provider-neutral and does not require Yahoo or paid API credentials.

## Lifecycle

1. A scheduled or on-demand caller invokes `services/provider-ingestion.ts`.
2. The adapter fetches its provider-specific payload and normalizes it.
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

NOC-61 extends the same sealed snapshot with canonical player identity evidence
and games. See [`historical-context.md`](./historical-context.md).

NOC-66 uses that identity path for the current Sleeper NFL player catalog. The
catalog adapter has its own provider-health slug while also writing the native
Sleeper player ID as an alias, so Sleeper market-trend records resolve to the
same canonical player. A daily freshness gate avoids repeatedly downloading the
large catalog. Catalog metadata is identity evidence only and must never be
presented as rankings, ADP, or projections. Attribution and the documented
personal/non-commercial licensing boundary are retained in snapshot provenance.

## Adding a provider

1. Implement `FantasyDataProviderAdapter` from `providers/types.ts`.
2. Keep authentication, pagination, rate-limit handling, and raw parsing inside
   the adapter.
3. Emit only the normalized contracts from `domain/fantasy-data.ts`.
4. Apply `describeProviderAdapterContract` from
   `tests/contracts/provider-adapter.contract.ts` to representative fixtures.
5. Invoke the same ingestion service for scheduled and manual refreshes.

The fixture adapter under `providers/fixture/` is the executable example.
Additional FantasyPros, FantasyNerds, and future adapters should not require
changes to the service, persistence schema, or downstream query contract.
