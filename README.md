# Fantasy Football GM

A deterministic, data-grounded fantasy football assistant for draft, waiver, and
lineup decisions. This repository currently contains the **application
foundation** (Linear issue **NOC-5**); domain features are delivered in
subsequent stories.

## Tech stack

| Concern            | Choice                                                  |
| ------------------ | ------------------------------------------------------- |
| Application        | [Next.js](https://nextjs.org) (App Router) + TypeScript |
| Styling            | [Tailwind CSS](https://tailwindcss.com)                 |
| Validation         | [Zod](https://zod.dev)                                  |
| Database           | Supabase Postgres _(introduced in a later story)_       |
| Authentication     | Supabase Auth _(introduced in a later story)_           |
| Unit/service tests | [Vitest](https://vitest.dev)                            |
| End-to-end tests   | [Playwright](https://playwright.dev)                    |
| Hosting            | Vercel (app) + Supabase (db/auth)                       |

See [`docs/architecture.md`](./docs/architecture.md) and
[`docs/adr/`](./docs/adr) for the decisions this project follows.

## Prerequisites

- **Node.js ≥ 20** (project developed on Node 22)
- **npm** (bundled with Node)

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Create your local environment file and fill in values
cp .env.example .env.local
# then edit .env.local — see "Environment variables" below

# 3. Start the dev server
npm run dev
```

The app runs at **http://localhost:3000**.

> The landing page renders without any Supabase configuration. Environment
> variables are only required by code paths that talk to Supabase, which arrive
> in later stories.

## Environment variables

Configuration is documented in [`.env.example`](./.env.example) and validated at
runtime by [`lib/env.ts`](./lib/env.ts) using Zod.

**Strategy**

- Variables prefixed **`NEXT_PUBLIC_`** are embedded in the browser bundle and
  are therefore **public**. Only non-secret, publishable values belong here.
- All other variables are **server-only** and must never reach the browser.
  They are used for privileged operations (service-role DB access, provider
  credentials).
- Read configuration through `lib/env.ts` (`getPublicEnv()` / `getServerEnv()`)
  rather than reading `process.env` directly. Missing or malformed values fail
  fast with a descriptive error naming the offending variable.

**Secrets hygiene**

- Real values live only in `.env.local`, which is **git-ignored**.
- Only `.env.example` (placeholders, no real secrets) is committed.
- Never prefix a secret with `NEXT_PUBLIC_`.

| Variable                        | Scope       | Purpose                                   |
| ------------------------------- | ----------- | ----------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Public      | Supabase project URL                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public      | Supabase publishable anon key             |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server-only | Privileged Supabase key (server use only) |

## Project structure

```
app/          Next.js routes/pages (App Router)
components/   Reusable UI components
lib/          Shared infrastructure (env, Supabase clients)
domain/       Fantasy-football domain logic (deterministic, pure)
services/     Application services / use cases
providers/    External data-provider adapters (normalize into internal contracts)
db/           Database access and migrations (Supabase Postgres)
tests/        Shared test helpers and Playwright e2e specs
docs/         Architecture doc and ADRs
```

Each directory contains a `README.md` describing its responsibility and the ADRs
that constrain it. The guiding rule: keep UI, domain logic, provider
integrations, and persistence separate.

## Scripts

| Command                | Description                                  |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Start the development server                 |
| `npm run build`        | Production build                             |
| `npm run start`        | Serve the production build                   |
| `npm run lint`         | ESLint (Next.js + TypeScript rules)          |
| `npm run typecheck`    | TypeScript type checking (`tsc --noEmit`)    |
| `npm run test`         | Run unit/service tests once (Vitest)         |
| `npm run test:watch`   | Vitest in watch mode                         |
| `npm run test:e2e`     | Playwright end-to-end tests                  |
| `npm run format`       | Format with Prettier                         |
| `npm run format:check` | Check formatting without writing             |
| `npm run validate`     | `lint` + `typecheck` + `test` (quality gate) |

### End-to-end tests

Playwright drives a production build. First install the browser binary once:

```bash
npx playwright install chromium
npm run test:e2e
```

## Quality bar

Before a change is considered complete: type checking passes, linting passes,
relevant tests pass, new domain logic has tests, database changes include
migrations, and no secrets are committed. See
[`docs/architecture.md`](./docs/architecture.md#quality-bar).

## Contributing / working agreement

Coding agents and contributors should read [`AGENTS.md`](./AGENTS.md) before
making changes. In short: read the relevant Linear issue and the applicable
architecture/ADR documents first, then implement the smallest coherent change
that satisfies the story.
