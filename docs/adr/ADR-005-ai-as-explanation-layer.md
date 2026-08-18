# ADR-005 — AI as Explanation Layer

> Mirrored from Linear. Linear remains the source of truth.

## Status

Accepted

## Context

The product should feel conversational and intelligent, but fantasy
recommendations depend on factual, rapidly changing data. Letting an LLM
generate raw rankings or statistics would make results difficult to trust and
test.

## Decision

Use AI to explain, compare, summarize, and contextualize outputs produced from
structured application data. The AI receives only the relevant league, roster,
availability, projections, rankings, injuries, and recommendation factors needed
for the question.

The AI must not be the authoritative source for player statistics, injury
status, projections, ADP, or final deterministic recommendation scores.

## Consequences

- Conversational UX remains flexible while factual inputs stay grounded.
- Prompt/model changes do not silently alter the ranking algorithm.
- AI responses should cite or expose the structured factors used when practical.
- If required structured data is missing or stale, the application should
  communicate that limitation rather than ask the AI to guess.
