# ADR-003 — Provider Adapter Boundary

> Mirrored from Linear. Linear remains the source of truth.

## Status

Accepted

## Context

Fantasy data providers differ in payload shape, authentication, refresh
cadence, availability, and licensing. The product should not be tightly coupled
to any single provider.

## Decision

Every external fantasy-data source must be integrated through a provider adapter
that converts provider-specific payloads into normalized internal contracts
before persistence or ranking logic consumes them.

Provider adapters own API/CSV parsing, provider-specific IDs, authentication,
pagination/rate-limit handling, and mapping into normalized DTOs. Domain
services and UI code must not depend directly on provider SDKs or raw provider
responses.

## Consequences

- New providers can be added with limited blast radius.
- Tests can use mock adapters and normalized fixtures.
- Provider outages or licensing changes are easier to handle.
- Consensus aggregation can combine normalized outputs from several sources.
