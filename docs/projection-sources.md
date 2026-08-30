# Projection Sources

Fantasy Football GM can ingest FantasyPros and Fantasy Nerds through the common
provider-adapter pipeline. Each source is optional: an unavailable or
unconfigured provider does not block the others, and CSV upload is a supported
no-key fallback.

## API setup

Keep credentials server-side in `.env.local` or the deployment environment.
Never prefix them with `NEXT_PUBLIC_` and never paste them into tickets, commits,
logs, or chat.

```dotenv
FANTASYPROS_API_KEY=""
FANTASYNERDS_API_KEY=""
```

- FantasyPros uses `FANTASYPROS_API_KEY` in the `x-api-key` request header.
  FantasyPros documents a free sample key and personal production access for
  HOF members at <https://www.fantasypros.com/api-data/>.
- Fantasy Nerds uses `FANTASYNERDS_API_KEY` as the provider-required `apikey`
  query parameter. The adapter removes that credential from stored provenance.
  Live access requires the provider's separate API plan; current endpoints are
  documented at <https://api.fantasynerds.com/docs/nfl>.

After configuration, use **Refresh projections** on the dashboard. The refresh
loads every configured provider independently and records per-dataset coverage.

## CSV fallback

Use **Import provider CSV** on the dashboard when a paid API is not configured.
Select the export's provider, season, optional week, and scoring format. Files
must use the `.csv` extension and be 2 MB or smaller.

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
canonical identity pipeline, and unresolved identities remain visible for
manual review.

## Data guarantees and limits

- Raw rows and normalized records are retained with provider, timestamp,
  adapter version, source URL, and freshness metadata.
- API datasets cover available rankings/ECR, ADP, projections, injuries, and
  news. CSV coverage depends on columns present in the export and does not
  synthesize missing fields.
- HTTP errors, unavailable datasets, and partial coverage remain explicit.
- A successful HTTP response containing no recognized records is treated as a
  failed refresh, preserving the last valid snapshot.
- Provider data is for the configured account's permitted personal use and is
  not redistributed by the app.

## Consensus and uncertainty

Consensus projections are derived records; they never replace provider data.
For each league and season/week scope the app:

1. selects the newest API or CSV delivery from each provider family;
2. recalculates normalized stat lines under the league scoring preset when a
   scorable stat line is available;
3. applies a versioned weighting configuration;
4. averages highly correlated expert-consensus feeds as one source group; and
5. stores the consensus, provider range, standard deviation, confidence, and
   exact contributing snapshots.

Later outcomes create separate provider and consensus error records. Summaries
can inform a new future weighting version by position and horizon, but never
rewrite an existing projection snapshot.
