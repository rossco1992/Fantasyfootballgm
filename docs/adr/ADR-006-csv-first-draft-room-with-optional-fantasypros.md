# ADR-006: CSV-first draft room with optional FantasyPros enhancement

## Status

Accepted

## Context

The combined draft-room action waited for both a player CSV import and five
FantasyPros API requests. A slow or incomplete API response could leave the
button pending for nearly two minutes even though the CSV was already usable.
Raw imported-record counts also did not describe how much of the active player
pool had rankings, ADP, and projections.

## Decision

The ranked player CSV is the dependable draft-room player pool. CSV replacement
is an independent action and never invokes FantasyPros.

FantasyPros remains an optional enhancement. The UI reports its exact coverage
against the active CSV player IDs for rankings, ADP, and projections. “Ready”
requires a fresh successful snapshot with at least 90% coverage in all three
datasets. Partial FantasyPros snapshots remain stored for diagnostics, but
recommendations continue reading the last successful FantasyPros snapshot.

## Consequences

- A FantasyPros outage cannot prevent draft-room setup or CSV replacement.
- Users see useful coverage instead of ambiguous imported-record totals.
- The data-source controls can stay collapsed during a draft.
- A partial refresh may be visible as the latest attempt while recommendations
  continue using the last successful snapshot.
