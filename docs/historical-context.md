# Historical Context and Market Trends

NOC-61 adds fixture-tested adapters for reproducible NFL history and
supplemental market movement. These inputs are evidence for later deterministic
models; neither source is treated as a projection.

## nflverse

`NflverseProviderAdapter` refreshes one season/week at a time from the official
nflverse CSV releases:

- weekly rosters for canonical GSIS identities and explicit Sleeper ID aliases
- weekly player stats for historical performance and opportunity metrics
- play-by-play participation for offensive snap counts when published
- schedules for game and matchup context

The adapter preserves each scoped source row beside its normalized record. A
roster crosswalk creates or reuses a canonical player using explicit provider
IDs only; it never guesses a player match by name. Identity evidence and games
are sealed inside the same immutable snapshot as player history and usage.

Play-by-play participation is supplemental. nflverse documents that data from
2023 onward may not be available until a season is complete. When present, it
requires attribution to **FTN Data via nflverse**; earlier participation data is
attributed to **NFL NextGenStats via nflverse**. A delayed participation file
creates an explicit coverage gap and a partial—but still usable—refresh.

Sources:

- <https://github.com/nflverse/nflverse-data>
- <https://nflreadr.nflverse.com/reference/load_player_stats.html>
- <https://nflreadr.nflverse.com/reference/load_rosters_weekly.html>
- <https://nflreadr.nflverse.com/reference/load_participation.html>
- <https://nflreadr.nflverse.com/reference/load_schedules.html>

## Sleeper trends

`SleeperTrendingAdapter` reads the supported public add/drop endpoints for a
24-hour window. Adds and drops remain separate `market_trend` records with raw
counts, timestamps, provenance, and explicit Sleeper attribution. They are
never combined with `projection` records or described as expected performance.

Sleeper IDs resolve through aliases supplied by the nflverse weekly roster
crosswalk. Unmatched rows are retained and make the refresh partial instead of
silently attaching activity to the wrong player.

Source: <https://docs.sleeper.com/#trending-players>

## Refresh and queries

`refreshHistoricalContext()` runs nflverse before Sleeper so newly observed
cross-platform aliases exist before market rows are persisted. Both scheduled
and on-demand calls use the same NOC-10 ingestion lifecycle.

Repositories expose three independent reads:

- `listLatestPlayerData()` for historical performance or usage by canonical
  player, season, and week
- `listLatestGames()` for the freshest immutable matchup snapshot by
  season/week
- `listLatestMarketTrends()` for attributed market activity, separate from
  projections and rankings

If one dataset is missing, source coverage marks the provider refresh partial.
If a provider fails entirely, the ingestion state keeps its last valid
snapshot and records the failed attempt.
