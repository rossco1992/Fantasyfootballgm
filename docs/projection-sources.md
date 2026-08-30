# CSV Data Imports

Fantasy Football GM accepts fantasy data only through CSV uploads. There are no
API keys, automatic provider refreshes, scheduled imports, or historical
backfill controls.

## Upload workflow

Use **Upload your CSV files** on the authenticated dashboard:

1. Select FantasyPros or Fantasy Nerds as the source.
2. Choose the season, optional week, and scoring format.
3. Select one or more `.csv` files.
4. Choose **Upload CSV files**.

A batch accepts up to 20 files, with a limit of 2 MB per file and 4 MB total.
Each file is imported independently: valid files remain available even when a
different file in the batch cannot be parsed.

Each filename has its own immutable snapshot stream. This allows separate
rankings, ADP, projections, and player-list exports from the same source to
coexist. Uploading a newer version with the same filename replaces that file's
active snapshot without deleting its earlier snapshots.

## Supported columns

Headers are case-insensitive and punctuation is normalized. Common supported
columns include:

| Signal          | Accepted examples                                                               |
| --------------- | ------------------------------------------------------------------------------- |
| Player identity | `player_id`, `player_name`, `player`, `name`, `pos`, `team`                     |
| Rankings        | `ecr`, `rank`, `rk`, `overall_rank`, `tier`, `position_rank`                    |
| ADP             | `adp`, `average_draft_position`, `position_adp`                                 |
| Projection      | `projected_points`, `projection`, `fpts`, `fantasy_points`, common stat columns |
| Injury          | `injury_status`, `game_status`, `injury`, `practice_status`                     |

When an export omits a provider player ID, the adapter derives a stable fallback
from normalized player name and position. Player matching still runs through the
canonical identity pipeline. Player identities in the latest CSV snapshots
collectively define the pool available in draft and roster tools.

## Data guarantees

- Raw rows and normalized records are retained with source, timestamp, adapter
  version, filename, and freshness metadata.
- CSV coverage depends on the columns present; missing fields are not invented.
- Existing immutable snapshots from older integrations remain in the database
  for compatibility but cannot be refreshed from the product.
- Consensus values remain separate from raw observations and keep the exact
  source snapshots used in each calculation.

For consensus, files from the same named source are treated as one correlated
provider family. The freshest usable projection per player and provider family
is selected before league scoring and uncertainty are calculated.
