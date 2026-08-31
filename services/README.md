# services/

Application services / use cases.

- Orchestrate domain logic, persistence, and provider adapters to fulfill a
  product use case (e.g. import projection files, produce draft
  recommendations for a league).
- This is where UI and route handlers call into. Services depend on `domain/`,
  `db/`, and `providers/`; UI and `domain/` do not depend on services.
- Keeps Supabase-specific and provider-specific concerns out of the UI and
  domain layers (see the Technical Architecture and ADR-004).

`provider-ingestion.ts` is the shared on-demand API/CSV ingestion use case.
It validates adapter output record by record, generates a deterministic source
fingerprint, persists immutable snapshots, returns partial/failure details, and
calculates source freshness. A failed attempt updates provider health but never
replaces the last valid snapshot.

`csv-import.ts` validates and imports several user-selected files in one batch.
Files are retained independently, so rankings and projections exported as
separate CSVs can coexist and one malformed file does not discard valid files.

`fantasypros-refresh.ts` creates the server-authenticated FantasyPros adapter
and sends its normalized snapshot through that same ingestion pipeline. The API
key never enters a form or browser response.

`data-health.ts` assembles provider freshness, failures, and unresolved player
counts for the dashboard. It also applies authenticated manual match decisions
through the persistence layer; provider-specific IDs never leak into ranking or
UI logic as canonical identities.

`projection-consensus.ts` selects the freshest projection per provider family,
applies the versioned deterministic blend, persists an immutable consensus
snapshot, and evaluates frozen provider/consensus predictions against later
outcomes. Replaying identical inputs produces the same fingerprint.

`draft-recommendations.ts` joins the exact Yahoo snapshot selected for the live
draft with the latest league-scored consensus projection, the user's live
roster, keeper context, and snake-draft turn order before calling the pure
domain ranking engine. If projections are unavailable it explicitly returns a
market-only Yahoo fallback rather than inventing values.
