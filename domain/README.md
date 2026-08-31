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

`fantasy-data.ts` defines the provider-neutral normalized contracts for
projections, rankings, ADP, injuries, news, historical performance, usage, and
market trends. Provider payloads are validated against these contracts before
they enter the canonical persistence layer.

`projection-consensus.ts` re-scores normalized projection stat lines under the
league preset, blends configurable provider weights, caps correlated source
groups to one vote, and returns range, standard deviation, confidence, and
traceable component factors. It contains no database or provider I/O.

`draft-recommendation.ts` ranks the active draft pool with a versioned,
deterministic blend of league-adjusted value, positional scarcity, next-pick
availability risk, roster fit, projection confidence, and injury penalties.
Every result includes the component scores and human-readable reasons used by
the draft-room UI.
