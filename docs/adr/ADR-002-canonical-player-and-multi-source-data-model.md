# ADR-002 — Canonical Player and Multi-Source Data Model

> Mirrored from Linear. Linear remains the source of truth.

## Status

Accepted

## Context

The application may use multiple data providers for players, ADP, rankings,
projections, injuries, usage, and waiver trends. Provider-specific IDs and
naming conventions will differ.

## Decision

The application owns a canonical internal player model with a stable internal
player ID. External provider IDs are stored separately and mapped to the
canonical player.

Raw provider values retain their source and timestamp. If multiple sources
provide the same signal, such as projection or ADP, the raw values remain
intact and any consensus/derived value is calculated separately.

## Consequences

- Providers can be added or replaced without changing core domain models.
- Historical provenance is preserved.
- The application can aggregate and compare multiple sources.
- Player matching becomes a first-class ingestion concern.
- Downstream ranking logic consumes normalized data rather than
  provider-specific payloads.
