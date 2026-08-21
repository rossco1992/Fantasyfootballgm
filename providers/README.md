# providers/

External data-provider adapters.

Per **ADR-003 — Provider Adapter Boundary**, every external fantasy-data source
(CSV or API) is integrated through an adapter that converts provider-specific
payloads into **normalized internal contracts** before persistence or ranking
logic consumes them.

Adapters own:

- API/CSV parsing
- Provider-specific IDs (mapped to the canonical player — see **ADR-002**)
- Authentication and credentials (server-side only)
- Pagination and rate-limit handling
- Mapping into normalized DTOs

Domain services and UI must **not** depend directly on provider SDKs or raw
provider responses.

## Adapter contract

Every fantasy-data adapter implements `FantasyDataProviderAdapter` from
`types.ts`:

1. `fetch()` retrieves a provider-specific payload.
2. `normalize()` converts it into the shared snapshot candidate.
3. The ingestion service validates each normalized record and quarantines bad
   records without discarding valid ones.

The supported normalized signals are projection, ranking/ECR, ADP, injury,
news, historical performance, usage, and market trend. Raw provider values stay
attached to every normalized record.

Adapters may also provide explicit player identity aliases and normalized game
records. These are validated and persisted inside the same immutable snapshot;
provider names/IDs never leak into downstream domain models.

`fixture/fixture-provider-adapter.ts` is the reference implementation. Apply
the reusable contract suite in `tests/contracts/provider-adapter.contract.ts`
to every future adapter.

Provider adapters do not write to Postgres. They hand candidates to
`services/provider-ingestion.ts`, which owns lifecycle, idempotency, and
persistence orchestration.

`nflverse/` supplies weekly roster identities, historical stats, play-level
participation, and schedules. `sleeper/` supplies attributed add/drop market
activity. Their source behavior and coverage rules are documented in
[`docs/historical-context.md`](../docs/historical-context.md).
