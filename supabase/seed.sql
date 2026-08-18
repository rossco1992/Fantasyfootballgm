-- Development seed data for Fantasy Football GM.
--
-- Produces a small but usable canonical dataset: two providers, a handful of
-- players, their provider-specific external IDs, and multi-source projections
-- (note the same player carries projections from two providers — raw values are
-- preserved side by side, never collapsed; see ADR-002).
--
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING, so it is safe to run against
-- an already-seeded development database. Run via `npm run db:seed`; it is also
-- applied automatically by `supabase db reset` and `npm run db:reset`.

-- Providers ------------------------------------------------------------------
insert into providers (id, slug, name) values
    ('11111111-1111-1111-1111-111111111111', 'csv-import',  'Manual CSV Import'),
    ('22222222-2222-2222-2222-222222222222', 'mock-adp',    'Mock ADP Provider')
on conflict (id) do nothing;

-- Players --------------------------------------------------------------------
insert into players (id, full_name, position, nfl_team) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'Christian McCaffrey', 'RB',  'SF'),
    ('aaaaaaaa-0000-0000-0000-000000000002', 'Ja''Marr Chase',      'WR',  'CIN'),
    ('aaaaaaaa-0000-0000-0000-000000000003', 'Patrick Mahomes',     'QB',  'KC'),
    ('aaaaaaaa-0000-0000-0000-000000000004', 'Sam LaPorta',         'TE',  'DET')
on conflict (id) do nothing;

-- External provider IDs mapped to canonical players (ADR-002) ----------------
insert into player_external_ids (id, player_id, provider_id, external_id) values
    ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'csv-cmc'),
    ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'adp-4029'),
    ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'csv-chase'),
    ('bbbbbbbb-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'csv-mahomes'),
    ('bbbbbbbb-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'csv-laporta')
on conflict (id) do nothing;

-- Multi-source projections (raw values preserved per source, ADR-002) --------
insert into player_projections
    (id, player_id, provider_id, season, week, scoring, projected_points, source_timestamp) values
    -- McCaffrey: same season-long projection from two providers, kept side by side
    ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 2026, null, 'ppr', 341.50, '2026-08-01T12:00:00Z'),
    ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 2026, null, 'ppr', 352.75, '2026-08-10T12:00:00Z'),
    ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 2026, null, 'ppr', 318.20, '2026-08-01T12:00:00Z'),
    ('cccccccc-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 2026, null, 'ppr', 389.10, '2026-08-01T12:00:00Z'),
    ('cccccccc-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 2026, null, 'ppr', 214.40, '2026-08-01T12:00:00Z')
on conflict (id) do nothing;
