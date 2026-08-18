# services/

Application services / use cases.

- Orchestrate domain logic, persistence, and provider adapters to fulfill a
  product use case (e.g. import a projections CSV, produce draft
  recommendations for a league).
- This is where UI and route handlers call into. Services depend on `domain/`,
  `db/`, and `providers/`; UI and `domain/` do not depend on services.
- Keeps Supabase-specific and provider-specific concerns out of the UI and
  domain layers (see the Technical Architecture and ADR-004).
