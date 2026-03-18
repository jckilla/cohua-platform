/**
 * geo-math.js — COHUA Geo Math Utilities
 *
 * Pure math — direct port from CohuaEngine.js Section 6.
 */

const DEG2RAD = Math.PI / 180;
const EARTH_R = 6371000;

/**
 * Haversine distance in meters between two lat/lon pairs.
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) *
               Math.sin(dLon / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Initial bearing in degrees from point 1 to point 2.
 */
export function bearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * DEG2RAD;
  const y    = Math.sin(dLon) * Math.cos(lat2 * DEG2RAD);
  const x    = Math.cos(lat1 * DEG2RAD) * Math.sin(lat2 * DEG2RAD) -
               Math.sin(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/**
 * Compass direction label from bearing degrees.
 */
export function bearingToCompass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

/**
 * Relative direction from user heading to target bearing.
 * Returns: 'ahead', 'left', 'right', 'behind'
 */
export function relativeDirection(userHeading, targetBearing) {
  let diff = (targetBearing - userHeading + 360) % 360;
  if (diff <= 45 || diff > 315) return 'ahead';
  if (diff > 45 && diff <= 135)  return 'right';
  if (diff > 135 && diff <= 225) return 'behind';
  return 'left';
}

/**
 * Parse hex color to { r, g, b } in 0–255 range.
 */
export function hexToRgb(hex) {
  hex = (hex || '#ff00ff').replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
  };
}
