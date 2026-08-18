# ADR-001 — Deterministic Ranking Engine

> Mirrored from Linear. Linear remains the source of truth.

## Status

Accepted

## Context

The product needs rankings and recommendations that are reproducible, testable,
explainable, and safe from LLM hallucination.

## Decision

All core player rankings and draft/waiver/lineup recommendation scores will be
calculated by deterministic application code using structured data such as
projections, league scoring, roster state, positional scarcity, ADP, tiers,
injuries, and matchup signals.

An LLM may explain or summarize these results but may not invent the underlying
rank, projection, injury status, or recommendation score.

## Consequences

- Ranking logic can be unit tested and backtested.
- Users can see why a player was recommended.
- We can improve weights over time without changing the conversational layer.
- Recommendation algorithms should return component factors in addition to a
  final score.
