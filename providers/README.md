# providers/

FantasyPros API and CSV data adapters.

Per **ADR-003 — Provider Adapter Boundary**, every external fantasy-data source
Every FantasyPros API response or uploaded fantasy-data file is processed by an
adapter that converts provider-specific fields into **normalized internal
contracts** before persistence or ranking logic consumes them.

Adapters own:

- API/CSV parsing
- Provider-specific IDs (mapped to the canonical player — see **ADR-002**)
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

`fantasypros/` authenticates to the Public API v2 and normalizes current NFL
players, consensus rankings/ADP, projections, and injuries. `manual/` normalizes
user-supplied FantasyPros and Fantasy Nerds exports.
Setup, supported fields, and import limits are documented in
[`docs/projection-sources.md`](../docs/projection-sources.md).
