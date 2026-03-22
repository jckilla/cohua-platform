/**
 * config.js — COHUA Configuration
 *
 * All tunable constants. Same values as CohuaEngine.js (Snap Spectacles).
 * TTS and pull model constants are centralised here so glasses-bridge.js
 * and the proximity engine share a single source of truth.
 */

export const Config = {
  // Supabase
  SUPABASE_URL:   'https://sgredejirqatcmstlzqi.supabase.co',
  SUPABASE_ANON:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncmVkZWppcnFhdGNtc3RsenFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDY3NTUsImV4cCI6MjA4ODU4Mjc1NX0.bV19P9HmMSDe4JGAmJHcmCIjN3kbZvHTuurmCRVD_sA',

  // Spatial thresholds
  RADIUS_M:       914,     // 3000 ft detection radius
  MIN_MOVE_M:     2.0,     // re-fetch after 2m movement
  TRIGGER_M:      50,      // fallback trigger distance — campaigns should specify trigger_distance_m

  // Timing
  FETCH_INTERVAL: 5000,    // ms between Supabase fetches
  GPS_INTERVAL:   1000,    // ms between GPS reads

  // Heading
  HEADING_ALPHA:  0.15,    // compass low-pass filter

  // ── TTS / Audio ───────────────────────────────────────────────────────
  // Centralised here so glasses-bridge.js has no magic numbers.

  TTS_RATE:               0.48,   // speech rate (0–1) — slightly slow for clarity through glasses speakers
  TTS_PITCH:              1.0,    // speech pitch (1.0 = normal)
  TTS_LANGUAGE:           'en-US',

  // Re-announcement throttling — avoid spamming the user
  TTS_THROTTLE_MS:        8000,   // minimum ms between announcements for the same campaign
  TTS_DISTANCE_BUCKET_FT: 100,    // re-announce each time user crosses a 100 ft boundary

  // ── Pull Model (gaze-triggered display) ───────────────────────────────
  // Reserved for when Meta releases a HUD API. The pull model lets the user
  // intentionally look toward a sign to "pull" the overlay into view.

  CONE_ANGLE_DEG:  60,    // full gaze cone width in degrees (±30° from heading)
  GAZE_DWELL_MS:   1500,  // ms user must hold gaze toward sign to trigger pull

  // Visual defaults
  DEFAULT_NEON:   '#ff00ff',
  DEFAULT_ALT_M:  7.0,

  // Asset type labels
  ASSET_LABELS: {
    neon_logo:  'NEON LOGO',
    neon_menu:  'NEON MENU',
    neon_image: 'NEON IMAGE',
    custom_3d:  '3D AD',
  },
};
