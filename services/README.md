# services/

Application services / use cases.

- Orchestrate domain logic, persistence, and provider adapters to fulfill a
  product use case (e.g. refresh a projection provider, produce draft
  recommendations for a league).
- This is where UI and route handlers call into. Services depend on `domain/`,
  `db/`, and `providers/`; UI and `domain/` do not depend on services.
- Keeps Supabase-specific and provider-specific concerns out of the UI and
  domain layers (see the Technical Architecture and ADR-004).

`provider-ingestion.ts` is the shared scheduled/on-demand ingestion use case.
It validates adapter output record by record, generates a deterministic source
fingerprint, persists immutable snapshots, returns partial/failure details, and
calculates source freshness. A failed attempt updates provider health but never
replaces the last valid snapshot.
