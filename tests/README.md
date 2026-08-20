# tests/

Shared test helpers and end-to-end assets.

- `tests/setup.ts` — global setup for Vitest (jest-dom matchers).
- `tests/e2e/` — Playwright end-to-end specs for critical flows.
- `tests/contracts/` — reusable provider adapter contract suites.
- Unit and service tests live next to the code they cover (e.g.
  `lib/env.test.ts`, `domain/**/*.test.ts`) and run under Vitest.

Testing stack (per the Technical Architecture): **Vitest** for unit/service
tests, **Playwright** for critical end-to-end flows. New domain logic must ship
with automated tests.
