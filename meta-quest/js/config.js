/**
 * config.js — COHUA Meta Quest 3 WebXR Configuration
 *
 * All tunable constants. Matches CohuaEngine.js (Snap Spectacles) values.
 */

const Config = {
  // Supabase project
  SUPABASE_URL:   'https://sgredejirqatcmstlzqi.supabase.co',
  SUPABASE_ANON:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncmVkZWppcnFhdGNtc3RsenFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDY3NTUsImV4cCI6MjA4ODU4Mjc1NX0.bV19P9HmMSDe4JGAmJHcmCIjN3kbZvHTuurmCRVD_sA',

  // Spatial thresholds
  RADIUS_M:       914,     // 3000 ft — only show campaigns within this range
  MIN_MOVE_M:     2.0,     // re-fetch after 2+ meters of movement

  // Timing
  FETCH_INTERVAL: 5.0,     // seconds between Supabase re-fetches
  GPS_POLL_S:     1.0,     // seconds between GPS reads

  // Heading filter
  HEADING_ALPHA:  0.15,    // low-pass filter weight for compass smoothing

  // Visual defaults
  DEFAULT_ALT_M:  7.0,
  DEFAULT_SCALE:  1.0,
  DEFAULT_NEON:   '#ff00ff',

  // Sign geometry
  PANEL_WIDTH:    3.5,
  PANEL_HEIGHT:   1.4,
  BAR_THICKNESS:  0.08,
  BAR_Y_OFFSET:   0.76,
  NAME_SIZE:      0.26,
  DIST_SIZE:      0.14,
  POLE_SEGMENTS:  8,
  POLE_RADIUS:    0.04,
  PANEL_OPACITY:  0.88,
  POLE_OPACITY:   0.6,
  MAX_LABEL_LEN:  22
};

export default Config;
