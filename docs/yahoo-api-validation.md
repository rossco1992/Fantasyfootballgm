# Yahoo Fantasy API Validation (NOC-52)

Validated against Yahoo's current public documentation and unauthenticated API
edge on **2026-08-23**. This is a bounded access/capability spike. The persistent
one-league OAuth connection belongs to NOC-53.

## Current decision

- Yahoo remains the system of record.
- The personal app will use **GET only** and will never submit roster, lineup,
  waiver, transaction, trade, or draft actions.
- Yahoo's current access page says Fantasy Sports API applications are reviewed
  and that the currently offered access is read-only. This current access rule
  takes precedence over older reference sections that still describe legacy
  PUT/POST/DELETE operations.
- An unauthenticated request to the NFL game endpoint reached Yahoo successfully
  but returned HTTP `401` with JSON in about `2.92s`, confirming that OAuth is
  required and the API edge is reachable from the runtime.
- No Yahoo credentials or tokens were available in the development environment,
  so authenticated OAuth and endpoint results remain pending approval/config.

## Access and OAuth findings

| Check                 | Current finding                                                                                                                                                                           | Verification state                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Developer access      | Every Fantasy API application is reviewed; incomplete submissions may be closed. Existing YDN users provide a Client ID, while approved new users are provisioned afterward.              | Approval for this app is not yet confirmed. Owner: Ross.     |
| Permission model      | The current application page says read access only and write access unavailable.                                                                                                          | Confirmed from Yahoo's current access page.                  |
| OAuth flow            | Authorization Code flow at `/oauth2/request_auth`, token exchange at `/oauth2/get_token`, with an exact redirect URI and state validation. Yahoo's published flow does not document PKCE. | Implemented and fixture-tested; live exchange pending.       |
| Access-token lifetime | Yahoo documents `expires_in=3600` (one hour).                                                                                                                                             | Documented; the probe records the live value.                |
| Refresh lifecycle     | A refresh token obtains a new access token and Yahoo may rotate the refresh token; the newest token must replace the previous one. Password changes or revocation can invalidate it.      | Rotation-safe local probe implemented; live refresh pending. |
| Secret handling       | Client secret, authorization code, access token, refresh token, and state stay server-side. The probe never prints tokens.                                                                | Enforced by code/tests.                                      |

The NOC-52 harness keeps the latest development refresh token in the git-ignored
`.yahoo-validation/` directory with owner-only filesystem permissions. NOC-53
must replace this temporary mechanism with encrypted, owner-scoped persistence
and revocation/disconnect behavior.

## Read-only capability matrix

Every probe below uses `GET`, sends a Bearer token, requests JSON, records HTTP
status/latency/content type, and captures `refresh_rate`, `Retry-After`, and
common rate-limit headers when Yahoo returns them. It never retains raw private
responses in its report.

| Capability           | Documented endpoint                                      | Official contract                                                | Authenticated result | Gap / fallback                                                                      |
| -------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| Current NFL leagues  | `/users;use_login=1/games;game_keys=nfl/leagues`         | Logged-in user's current NFL leagues                             | Pending access       | Allow explicit league key/manual configuration.                                     |
| League history       | `/users;use_login=1/games/leagues`                       | Leagues beneath games played by logged-in user                   | Pending access       | Historical coverage is limited to leagues Yahoo returns; retain manual import.      |
| Settings and scoring | `/league/{league_key}/settings`                          | Draft type, scoring, roster positions, stat categories/modifiers | Pending access       | Existing editable league configuration remains available.                           |
| Teams/managers       | `/league/{league_key}/teams`                             | Teams and manager metadata                                       | Pending access       | Explicit team selection/manual correction.                                          |
| Draft results        | `/league/{league_key}/draftresults`                      | League draft results                                             | Pending access       | Manual pick entry is required when delayed/unavailable.                             |
| Rosters              | `/team/{team_key}/roster;week={week}`                    | One NFL roster for a week/current week                           | Pending access       | Preserve last valid roster and allow correction.                                    |
| Matchups             | `/league/{league_key}/scoreboard;week={week}`            | Scoreboard with matchups/teams                                   | Pending access       | Preserve last valid matchup state.                                                  |
| Standings            | `/league/{league_key}/standings`                         | Ranked teams and records                                         | Pending access       | Preserve last valid standings.                                                      |
| Transactions         | `/league/{league_key}/transactions`                      | Completed adds, drops, trades, and settings changes              | Pending access       | Manual refresh; pending private claims may not appear in the unfiltered collection. |
| Available players    | `/league/{league_key}/players;status=A;start=0;count=25` | Available free-agent/waiver pool with pagination                 | Pending access       | Paginated refresh plus last-valid snapshot.                                         |

Yahoo's current reference documents the above GET resources. Historical draft
results require the league key for each season; the API does not create one
cross-season draft-history object.

## Rate limits and polling

Yahoo does not publish one numeric Fantasy API request quota on its current
public pages. It states that excessive short-period usage may be throttled or
limited. The reference response envelopes also expose a `refresh_rate` value.
Therefore the app must not load-test the service or invent a quota.

Polling rules:

1. Honor `Retry-After` first. On `429` or `5xx`, back off exponentially to 30s,
   60s, 2m, then 5m with small jitter; keep the last valid snapshot.
2. Never poll a resource faster than its observed `refresh_rate`.
3. Outside a live draft, refresh league state on demand and at a low cadence
   (normally 5–15 minutes in season; settings/draft history only when needed).
4. During a live draft, poll only `draftresults`. Start with a desired 15-second
   interval, but raise it to Yahoo's returned `refresh_rate` when higher. Stop
   immediately when the draft is complete or the user leaves the draft.
5. If the effective interval is too slow for the next pick, make manual pick
   entry/undo the authoritative local draft-board input and reconcile with Yahoo
   later. Never submit the pick back to Yahoo.

An active draft is still required to measure pick-publication delay. Owner:
Ross at the first available live or test draft. The manual board is the required
fallback, so this measurement does not block the rest of the personal MVP.

## Running the validation

1. Confirm Yahoo approved the application for Fantasy Sports **Read** access and
   that its callback exactly matches `YAHOO_REDIRECT_URI`.
2. Copy `.env.example` to `.env.local` and set the server-only Yahoo Client ID,
   Client Secret, and redirect URI locally. Do not put them in GitHub, Linear,
   or chat.
3. Run `npm run yahoo:auth-url`, open the printed URL, authorize the app, and put
   the returned authorization `code` and `state` into the one-time local fields.
4. Run `npm run yahoo:validate`. The command exchanges the code, probes the
   read-only matrix sequentially, verifies refresh-token exchange, and prints a
   redacted JSON report.
5. Remove the one-time authorization code/state. Revoke the test grant when the
   spike is no longer needed.

## Sources

- [Yahoo Fantasy API developer overview](https://sports.yahoo.com/developer/)
- [Yahoo Fantasy API access application](https://sports.yahoo.com/developer/access/)
- [Yahoo Fantasy Sports API reference](https://sports.yahoo.com/developer/docs/)
- [Yahoo OAuth 2.0 Authorization Code flow](https://developer.yahoo.com/oauth2/guide/flows_authcode/)
- [Yahoo OAuth 2.0 FAQ](https://developer.yahoo.com/oauth2/guide/faq/)

Yahoo also requires product attribution linking back to Yahoo Fantasy. NOC-53
must include the current required attribution before displaying Yahoo data.
