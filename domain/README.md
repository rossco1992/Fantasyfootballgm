# domain/

Fantasy-football domain logic.

- Canonical models (e.g. the internal player model) and pure, deterministic
  domain rules.
- The ranking and recommendation engine lives here and must be deterministic
  and unit-testable. See **ADR-001 — Deterministic Ranking Engine**: rankings
  and recommendation scores are computed by application code from structured
  data, never invented by an LLM.
- Consumes **normalized** data (per **ADR-002** and **ADR-003**), not
  provider-specific payloads.
- No I/O here: no database calls, no HTTP, no framework imports. This keeps the
  domain portable and testable.

See [`docs/player-identity.md`](../docs/player-identity.md) for the canonical NFL
player fields, uniqueness rules, and deterministic provider-record matching
strategy implemented in `player.ts`.
