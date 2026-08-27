# Canonical Player Identity and Matching

NOC-9 establishes the application-owned NFL player identity required by
ADR-002. NOC-11 makes that identity safe across provider imports with durable
review, override, and audit records.

## Canonical fields

- `id`: stable application-owned UUID
- `fullName`: provider-independent display name
- `position`: QB, RB, WR, TE, K, or DST for the MVP roster model
- `nflTeam`: two- or three-letter team abbreviation, or `null` for a free agent
  or unknown team
- `byeWeek`: current known bye week from 1 through 22, or `null`
- `status`: normalized availability designation (`active`, `questionable`,
  `doubtful`, `out`, `injured_reserve`, `physically_unable_to_perform`,
  `suspended`, `inactive`, `retired`, or `unknown`)

## Identity and uniqueness

- `players.id` is the stable internal UUID used by every downstream dataset.
- `(provider_id, external_id)` is unique in `player_external_ids` and maps a
  provider record to exactly one canonical player.
- Names are not unique. Two real players can share a name and position, so the
  database deliberately does not enforce name-based uniqueness.
- NFL team, bye week, and player status are mutable attributes. They never form
  part of a player's identity, which allows trades and free agency without
  creating a new player.
- `nfl_team = null` represents a free agent or an unknown team.

## Deterministic matching order

1. Match an existing `(provider_id, external_id)` mapping when available. This
   is authoritative even if a display name or team has changed.
2. Otherwise, compare normalized name plus position. Normalization removes
   accents and punctuation, lowercases, and collapses whitespace.
3. If more than one name-and-position candidate exists, use NFL team only as a
   tie-breaker.
4. If the result is still ambiguous, return all candidate IDs for review. Never
   silently merge or create a provider mapping from an ambiguous match.
5. If a provider supplies authoritative identity data and there is no
   candidate, create a canonical player and attach its provider aliases.
6. If a signal record (projection, ranking, ADP, injury, usage, or trend) has no
   mapping, persist the immutable source record without a player and place its
   external ID in `player_match_reviews`.

Ambiguous identity records and their related signal rows are quarantined from
recommendations. An authenticated manual resolution writes the durable
`player_external_ids` alias, closes the review, and appends a
`player_match_audit_events` record. Read-time resolution lets that correction
apply to older immutable snapshots without rewriting source evidence.

The pure implementation is in `domain/player.ts`. Provider adapters normalize
their source data before invoking this strategy; repository functions persist
the chosen canonical player and external-ID mapping.
