# Fantasy Football GM

A deterministic, data-grounded fantasy football assistant for draft, waiver, and
lineup decisions. The current foundation includes authentication, one-league
configuration, canonical player identity, and a CSV-only fantasy-data ingestion
pipeline for uploaded player lists, rankings, ADP, and projections.

## Tech stack

| Concern            | Choice                                                  |
| ------------------ | ------------------------------------------------------- |
| Application        | [Next.js](https://nextjs.org) (App Router) + TypeScript |
| Styling            | [Tailwind CSS](https://tailwindcss.com)                 |
| Validation         | [Zod](https://zod.dev)                                  |
| Database           | Supabase Postgres                                       |
| Authentication     | Supabase Auth                                           |
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

> The landing page renders without Supabase configuration. Registration,
> sign-in, password reset, and authenticated routes require the public Supabase
> variables below.

## Environment variables

Configuration is documented in [`.env.example`](./.env.example) and validated at
runtime by [`lib/env.ts`](./lib/env.ts) using Zod.

**Strategy**

- Variables prefixed **`NEXT_PUBLIC_`** are embedded in the browser bundle and
  are therefore **public**. Only non-secret, publishable values belong here.
- All other variables are **server-only** and must never reach the browser.
  They are used for privileged operations such as service-role DB access.
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
| `DATABASE_URL`                  | Server-only | Postgres migrations and persistence       |

## Authentication

Authentication uses Supabase Auth with cookie-based server-side sessions. The
public routes are `/register`, `/login`, and `/auth/forgot-password`.
`/dashboard` and `/auth/update-password` require a verified session.

In Supabase Dashboard → Authentication → URL Configuration:

- Set the local Site URL to `http://localhost:3000` while developing.
- Add `http://localhost:3000/auth/callback` to Redirect URLs.
- Add the deployed `/auth/callback` URL before production testing.

Email confirmation and password reset use that callback to exchange the PKCE
auth code for a cookie-backed session. Supabase's default email service is
suitable for development but rate-limited; configure custom SMTP before
production use.

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
| `npm run db:migrate`   | Apply pending database migrations            |
| `npm run db:seed`      | Load development seed data (idempotent)      |
| `npm run db:reset`     | Drop schema, re-migrate, re-seed (dev only)  |
| `npm run format`       | Format with Prettier                         |
| `npm run format:check` | Check formatting without writing             |
| `npm run validate`     | `lint` + `typecheck` + `test` (quality gate) |

### End-to-end tests

Playwright drives a production build. First install the browser binary once:

```bash
npx playwright install chromium
npm run test:e2e
```

## Database

The app uses **Supabase Postgres**. The persistence layer lives in
[`db/`](./db) and all schema is defined by ordered SQL migrations under
[`supabase/migrations/`](./supabase/migrations) (the source of truth). See
[`db/README.md`](./db/README.md) for the layer's structure and the canonical
data model.

Provider ingestion is append-only: CSV import attempts preserve
raw values, validated normalized records, adapter version, timestamps, and
provenance. See [`providers/README.md`](./providers/README.md) for the adapter
contract and [`services/README.md`](./services/README.md) for orchestration.

Upload one or more FantasyPros or Fantasy Nerds CSV files from the dashboard.
The uploaded player identities define the draftable pool, and recognized
ranking, ADP, projection, injury, and status columns feed the recommendation
pipeline. See [`docs/projection-sources.md`](./docs/projection-sources.md).

### Local/development setup

You need a Postgres to point `DATABASE_URL` at (see `.env.example`). Two common
options:

**Option A — Supabase CLI (full local stack, recommended):**

```bash
# Install the Supabase CLI: https://supabase.com/docs/guides/cli
supabase start                 # boots local Postgres + Studio (requires Docker)
# copy the printed "DB URL" into .env.local as DATABASE_URL
supabase db reset              # applies migrations + supabase/seed.sql
```

**Option B — any Postgres (no Docker):** point `DATABASE_URL` at a local or
hosted Postgres (including a hosted Supabase project), then:

```bash
npm run db:migrate   # create the schema from migrations
npm run db:seed      # load development seed data
# or, to rebuild from scratch (dev only):
npm run db:reset
```

### Workflow

- Add a schema change as a **new** migration file in `supabase/migrations/`
  (e.g. `0002_add_leagues.sql`) — never edit an applied migration. `npm run
db:new <name>` scaffolds one via the Supabase CLI.
- Migrations are applied in filename order and tracked in `schema_migrations`,
  so `db:migrate` only runs what is pending.
- `supabase/seed.sql` is idempotent (fixed UUIDs + `on conflict do nothing`).
- Access data through the repositories in `db/repositories/*` — do not query
  the database from UI or domain code (ADR-004).

A fast, Docker-free check that the migrations and seed are valid runs as part
of the normal test suite (`db/schema.test.ts`, backed by an in-process
Postgres).

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
