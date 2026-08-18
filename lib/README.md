# lib/

Shared infrastructure and cross-cutting utilities.

- `lib/env.ts` — validated environment access (public vs. server-only) using
  Zod. Import this instead of reading `process.env` directly.
- `lib/supabase/` — Supabase client factories for browser and server contexts
  (the persistence/auth boundary from ADR-004).

Keep product/domain rules out of `lib/`; this layer is generic plumbing.
