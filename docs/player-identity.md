# Canonical Player Identity and Matching

NOC-9 completes the application-owned NFL player identity required by ADR-002.

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
5. If there is no candidate, return unmatched so an ingestion service can
   create a new canonical player and then attach the provider ID.

The pure implementation is in `domain/player.ts`. Provider adapters normalize
their source data before invoking this strategy; repository functions persist
the chosen canonical player and external-ID mapping.
