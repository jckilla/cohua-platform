-- ============================================================================
-- COHUA Platform — Seed Data
-- Run against the Supabase SQL editor to insert new client + campaign records.
-- ============================================================================

-- Aduna Capital client
INSERT INTO public.clients (name, contact_email, status, latitude, longitude, notes)
VALUES (
  'Aduna Capital',
  'alfonso@adunacapital.com',
  'active',
  33.902004,
  -118.058390,
  'Launch client – Alfonso Aduna'
);

-- ADUNA CAPITAL campaign
INSERT INTO public.campaigns (
  client_id, name, status, latitude, longitude, altitude_m,
  model_scale, asset_type, deploy_payload, location_label
)
VALUES (
  (SELECT id FROM public.clients WHERE name = 'Aduna Capital' LIMIT 1),
  'ADUNA CAPITAL', 'live', 33.902004, -118.058390, 20.0,
  1.0, 'neon_logo', '{"neon_color": "#FFD700", "offset_m": 0}',
  'Aduna Capital HQ – Norwalk, CA'
);
