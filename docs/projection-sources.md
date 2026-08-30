# FantasyPros and CSV Data

FantasyPros Public API v2 is the personal MVP's only live fantasy-data source.
CSV upload remains available as a manual backup for FantasyPros and Fantasy
Nerds exports. Sleeper, nflverse, Yahoo, and the Fantasy Nerds API are not active
integrations.

## FantasyPros refresh

Configure the server-only key in `.env.local` and every applicable Vercel
environment:

```dotenv
FANTASYPROS_API_KEY=""
```

Never prefix this variable with `NEXT_PUBLIC_`, include it in a form, or print it
in a log. The adapter sends it only in the `x-api-key` request header.

The authenticated dashboard's **Refresh FantasyPros data** action imports:

| Signal            | Public API v2 request                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Draftable players | `/nfl/players?ecr=included&show=pos_rank`                                                |
| ECR and ADP       | `/nfl/{season}/consensus-rankings?position=ALL&type=DRAFT&scoring={scoring}&week={week}` |
| Projections       | `/nfl/{season}/projections?position=ALL&week={week}`                                     |
| Injuries          | `/nfl/injuries?year={season}&week={week}&include_probabilities=true`                     |

Pre-draft imports use week `0`. Standard, half-PPR, and PPR points are selected
from the API's `points`, `points_half`, and `points_ppr` projection fields. Raw
provider rows and normalized records are persisted together in one immutable
snapshot. A response with no recognized player data is rejected so it cannot
replace a usable prior snapshot.

## CSV backup

Expand **Upload CSV backup** on the dashboard, choose a source and scope, and
select one or more `.csv` files. A batch accepts up to 20 files, with a limit of
2 MB per file and 4 MB total. Each file is imported independently.

Headers are case-insensitive and punctuation is normalized. Common supported
columns include:

| Signal          | Accepted examples                                                               |
| --------------- | ------------------------------------------------------------------------------- |
| Player identity | `player_id`, `player_name`, `player`, `name`, `pos`, `team`                     |
| Rankings        | `ecr`, `rank`, `rk`, `overall_rank`, `tier`, `position_rank`                    |
| ADP             | `adp`, `average_draft_position`, `position_adp`                                 |
| Projection      | `projected_points`, `projection`, `fpts`, `fantasy_points`, common stat columns |
| Injury          | `injury_status`, `game_status`, `injury`, `practice_status`                     |

Each filename has its own snapshot stream, allowing separate player, ranking,
ADP, and projection exports to coexist. When an export omits a provider player
ID, the adapter derives a stable fallback from normalized name and position.

## Consensus behavior

FantasyPros API and FantasyPros CSV snapshots belong to the same provider
family, so they are never double-counted. The freshest usable projection for a
player and provider family is selected before league scoring and uncertainty are
calculated. Consensus remains a derived record and never overwrites raw source
data.
