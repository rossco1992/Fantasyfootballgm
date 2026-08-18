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
provider responses. Tests use mock adapters and normalized fixtures.
