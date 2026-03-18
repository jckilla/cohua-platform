/**
 * config.js — COHUA Configuration
 *
 * All tunable constants. Same values as CohuaEngine.js (Snap Spectacles).
 */

export const Config = {
  // Supabase
  SUPABASE_URL:   'https://sgredejirqatcmstlzqi.supabase.co',
  SUPABASE_ANON:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncmVkZWppcnFhdGNtc3RsenFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDY3NTUsImV4cCI6MjA4ODU4Mjc1NX0.bV19P9HmMSDe4JGAmJHcmCIjN3kbZvHTuurmCRVD_sA',

  // Spatial thresholds
  RADIUS_M:       914,     // 3000 ft detection radius
  MIN_MOVE_M:     2.0,     // re-fetch after 2m movement
  TRIGGER_M:      50,      // proximity trigger for glasses display (50m)

  // Timing
  FETCH_INTERVAL: 5000,    // ms between Supabase fetches
  GPS_INTERVAL:   1000,    // ms between GPS reads

  // Heading
  HEADING_ALPHA:  0.15,    // compass low-pass filter

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
